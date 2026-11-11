package com.eodilog.recommendation;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.job.Job;
import com.eodilog.job.JobErrorCode;
import com.eodilog.job.JobKind;
import com.eodilog.job.JobRef;
import com.eodilog.job.JobService;
import com.eodilog.job.JobSubmission;
import com.eodilog.trip.service.TripAccessChecker;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// AI 여행지 추천(EODI-284, 명세 §5 POST/GET /trips/{tripId}/recommendations, 화면 S21)
@Service
@RequiredArgsConstructor
public class TripRecommendationService {

	private final IdempotencyService idempotencyService;
	private final TripAccessChecker tripAccessChecker;
	private final TripRecommendationSnapshot snapshot;
	private final RecommendationPublisher publisher;
	private final JobService jobService;
	private final JdbcTemplate jdbcTemplate;

	private final tools.jackson.databind.json.JsonMapper jsonMapper;

	record Fingerprint(@JsonInclude(JsonInclude.Include.NON_NULL) UUID regionId) {
	}

	private record Row(UUID tripId, String result) {
	}

	// 판정 순서: 키 400 → 비멤버 404 → 없는 regionId 400 → 등록. 같은 키·같은 본문 재요청은 처음 JobRef를 돌려준다.
	// 자료 부족(즐겨찾기 3곳·취향 멤버 2명 미만)은 막지 않는다. AI가 insufficientData로 답하고 화면이 그 상태를 보여 준다
	@Transactional
	public JobRef request(UUID userId, UUID tripId, String idempotencyKey, TripRecommendationRequest request) {
		idempotencyService.validateKey(idempotencyKey);
		UUID regionId = request == null ? null : request.regionId();
		tripAccessChecker.requireActiveMemberForUpdate(tripId, userId);
		if (regionId != null && Boolean.FALSE.equals(jdbcTemplate.queryForObject(
				"select exists(select 1 from regions where id = ?)", Boolean.class, regionId))) {
			throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
					List.of(new ErrorField("regionId", "없는 지역입니다.")));
		}
		return idempotencyService.execute(userId, "POST /api/v1/trips/" + tripId + "/recommendations", idempotencyKey,
				new Fingerprint(regionId), JobRef.class, HttpStatus.ACCEPTED,
				() -> jobService.submit(new JobSubmission(userId, JobKind.TRIP_RECOMMENDATION, tripId,
						snapshot.build(tripId, regionId), null, null)));
	}

	// 여행의 현재 ACTIVE 멤버 누구나. 다른 여행·다른 종류·볼 수 없는 작업은 404 JOB_NOT_FOUND
	@Transactional(readOnly = true)
	public TripRecommendationResponse get(UUID viewerId, UUID tripId, UUID jobId) {
		Job job = jobService.get(viewerId, jobId);
		// job.result는 정책이 공개용으로 바꾼 값이라, 저장한 결과(ID)는 작업 행에서 직접 읽는다
		List<Row> rows = jdbcTemplate.query("""
				select trip_id, case when status = 'SUCCEEDED' then result_json::text end as result
				from jobs where id = ? and kind = 'TRIP_RECOMMENDATION' and deleted_at is null""",
				(rs, n) -> new Row(rs.getObject("trip_id", UUID.class), rs.getString("result")), jobId);
		if (job.kind() != JobKind.TRIP_RECOMMENDATION || rows.size() != 1 || !tripId.equals(rows.getFirst().tripId())) {
			throw new BusinessException(JobErrorCode.JOB_NOT_FOUND);
		}
		String result = rows.getFirst().result();
		if (result == null) {
			return new TripRecommendationResponse(job, List.of(), TripRecommendationResponse.EMPTY_BASIS, false);
		}
		StoredRecommendation stored = StoredRecommendation.parseStored(jsonMapper.readTree(result))
				.orElseThrow(() -> new IllegalStateException("Invalid stored trip recommendation"));
		return new TripRecommendationResponse(job, publisher.items(stored), publisher.basis(stored), stored.insufficientData());
	}

}
