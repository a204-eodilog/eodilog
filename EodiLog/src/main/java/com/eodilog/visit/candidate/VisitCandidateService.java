package com.eodilog.visit.candidate;

import com.eodilog.asset.AssetErrorCode;
import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.job.JobKind;
import com.eodilog.job.JobRef;
import com.eodilog.job.JobService;
import com.eodilog.job.JobSubmission;
import com.eodilog.photo.PhotoErrorCode;
import com.eodilog.place.service.PlaceReader;
import com.eodilog.trip.service.TripAccessChecker;
import com.eodilog.visit.domain.Visit;
import com.eodilog.visit.dto.VisitResponse;
import com.eodilog.visit.repository.ReviewRepository;
import com.eodilog.visit.repository.VisitRepository;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

// 사진 방문 후보(명세 §6). 감지는 후보만 제안하고, 실제 방문은 후보 본인이 확정할 때만 생긴다
@Service
@RequiredArgsConstructor
public class VisitCandidateService {

	private final JdbcTemplate jdbc;
	private final TripAccessChecker trips;
	private final VisitCandidateAccess access;
	private final VisitCandidateStore store;
	private final IdempotencyService idempotency;
	private final JobService jobs;
	private final VisitRepository visits;
	private final ReviewRepository reviews;
	private final PlaceReader places;
	private final JsonMapper json;
	private final Clock clock;

	/**
	 * 판정 순서: 키·본문 400 → 여행 404 → 설정 OFF 409 → 51장 이상 422 / 중복 400 → 여행 기간 없음 422 INSUFFICIENT_DATA → 내 사진이 아님 404 → 등록(같은 키·본문이면 처음 작업).
	 * 위치·시각 메타데이터가 없는 사진도 받아 두고 AI에 보내지 않는다. 남이 올린 사진은 근거로 쓰지 않는다(D-16).
	 */
	@Transactional
	public JobRef request(UUID user, UUID trip, String key, VisitDetectionRequest request) {
		idempotency.validateKey(key);
		UUID member = trips.requireActiveMemberForUpdate(trip, user).member().getId();
		if (access.disabled(user)) {
			throw new BusinessException(VisitCandidateErrorCode.AI_FEATURE_DISABLED);
		}
		List<UUID> ids = request.photoIds();
		if (ids.size() > VisitDetectionHandler.MAX_PHOTOS) {
			throw new BusinessException(AssetErrorCode.INPUT_LIMIT_EXCEEDED, "사진은 " + VisitDetectionHandler.MAX_PHOTOS + "장까지 보낼 수 있습니다.");
		}
		if (ids.stream().anyMatch(Objects::isNull) || new HashSet<>(ids).size() != ids.size()) {
			throw invalid("photoIds", "사진을 중복 없이 보내 주세요.");
		}
		if (access.startDate(trip) == null) {
			throw new BusinessException(VisitCandidateErrorCode.INSUFFICIENT_DATA, VisitCandidateErrorCode.INSUFFICIENT_DATA.message(),
					List.of(new ErrorField("trip.startDate", "여행 기간을 먼저 정해 주세요.")));
		}
		// 재요청에도 검사한다: 지운·옮긴 사진으로 예전 요청이 되살아나지 않는다. 같은 키의 다른 본문은 execute가 409로 거부한다
		Long own = jdbc.queryForObject("""
				select count(*) from photos p join assets a on a.id=p.asset_id
				where p.id=any(?) and p.trip_id=? and p.uploader_member_id=? and p.deleted_at is null and a.status='READY'""",
				Long.class, ids.toArray(UUID[]::new), trip, member);
		if (own == null || own != ids.size()) {
			throw new BusinessException(PhotoErrorCode.PHOTO_NOT_FOUND);
		}
		var input = json.createObjectNode().put("memberId", member.toString());
		var photoIds = input.putArray("photoIds");
		ids.forEach(id -> photoIds.add(id.toString()));
		// 사진 순서는 의미가 없다: 같은 사진 집합이면 같은 본문으로 보고 처음 작업을 돌려준다
		var fingerprint = new VisitDetectionRequest(ids.stream().sorted().toList());
		return idempotency.execute(user, "POST /api/v1/trips/" + trip + "/visit-detections", key, fingerprint, JobRef.class,
				HttpStatus.ACCEPTED, () -> jobs.submit(new JobSubmission(user, JobKind.VISIT_DETECTION, trip, input, null, null)));
	}

	/**
	 * 판정 순서: expectedVersion 400 → 여행 404 → 내 후보가 아님 404 → 이미 확정이면 연결된 방문 → 설정 OFF 409 → 무효(근거 사진 이동·삭제,
	 * 장소 없음 포함) 409 VISIT_CANDIDATE_INVALIDATED → version 409 VERSION_CONFLICT → 방문 생성(또는 이미 직접 체크한 같은 장소 방문 연결).
	 * 확정하면 version이 오르고, 같은 장소의 다른 미확정 후보는 무효가 된다(여행·멤버·장소당 방문 하나).
	 */
	@Transactional
	public VisitResponse confirm(UUID user, UUID trip, UUID candidateId, ConfirmVisitCandidateRequest request) {
		if (request.expectedVersion() == null || request.expectedVersion() < 1) {
			throw invalid("expectedVersion", "조회한 후보 version을 보내 주세요.");
		}
		UUID member = trips.requireActiveMemberForUpdate(trip, user).member().getId();
		var candidate = store.lock(candidateId, trip).filter(c -> c.memberId().equals(member))
				.orElseThrow(() -> new BusinessException(VisitCandidateErrorCode.VISIT_CANDIDATE_NOT_FOUND));
		if ("CONFIRMED".equals(candidate.status())) {
			// 같은 후보를 다시 확정하면 처음 만든 방문을 그대로 준다(설정을 꺼도 이미 만든 방문 반환). 체크 해제했으면 더 확정할 수 없다
			Visit linked = visits.findById(candidate.visitId()).filter(v -> v.getDeletedAt() == null)
					.orElseThrow(() -> new BusinessException(VisitCandidateErrorCode.VISIT_CANDIDATE_INVALIDATED));
			return response(linked);
		}
		if (access.disabled(user)) {
			throw new BusinessException(VisitCandidateErrorCode.AI_FEATURE_DISABLED);
		}
		if ("INVALIDATED".equals(candidate.status()) || !candidate.live() || places.find(candidate.placeId()).isEmpty()) {
			throw new BusinessException(VisitCandidateErrorCode.VISIT_CANDIDATE_INVALIDATED);
		}
		if (candidate.version() != request.expectedVersion()) {
			throw new BusinessException(VisitCandidateErrorCode.VERSION_CONFLICT);
		}
		var existing = visits.findByTripIdAndMemberIdAndPlaceIdAndDeletedAtIsNull(trip, member, candidate.placeId());
		Visit visit;
		if (existing.isPresent()) {
			// 이미 직접 체크한 장소면 새로 만들지 않고 그 방문에 연결한다. 다른 후보가 먼저 연결했으면 이 후보는 쓸 수 없다
			Boolean linked = jdbc.queryForObject("select exists(select 1 from visit_candidates where visit_id=?)", Boolean.class,
					existing.get().getId());
			if (Boolean.TRUE.equals(linked)) {
				throw new BusinessException(VisitCandidateErrorCode.VISIT_CANDIDATE_INVALIDATED);
			}
			visit = existing.get();
		} else {
			visit = visits.saveAndFlush(Visit.photo(trip, member, candidate.placeId(), candidate.visitedAt(),
					clock.instant().truncatedTo(ChronoUnit.MICROS)));
		}
		jdbc.update("update visit_candidates set status='CONFIRMED',visit_id=?,version=version+1 where id=?", visit.getId(), candidateId);
		jdbc.update("""
				update visit_candidates set status='INVALIDATED',version=version+1
				where trip_id=? and member_id=? and place_id=? and status='PENDING' and id<>?""",
				trip, member, candidate.placeId(), candidateId);
		return response(visit);
	}

	private VisitResponse response(Visit visit) {
		return VisitResponse.of(visit, reviews.findByVisitId(visit.getId()).orElse(null));
	}

	private static BusinessException invalid(String field, String message) {
		return new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
				List.of(new ErrorField(field, message)));
	}

}
