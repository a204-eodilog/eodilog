package com.eodilog.itinerary.route;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.itinerary.domain.Itinerary;
import com.eodilog.itinerary.exception.ItineraryErrorCode;
import com.eodilog.itinerary.repository.ItineraryRepository;
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
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

// 코스 구간 이동 시간 다시 구하기(EODI-275). 시간이 없는(UNAVAILABLE) 구간만 등록 때 고정해 작업으로 넘긴다.
// 코스를 직접 고치면(PUT) 모든 구간이 시간 없음으로 바뀌므로, 사용자가 코스를 고친 뒤 이 요청으로 시간을 채운다
@Service
@RequiredArgsConstructor
public class RouteRecalculationService {

	private final IdempotencyService idempotencyService;
	private final TripAccessChecker tripAccessChecker;
	private final ItineraryRepository itineraryRepository;
	private final JdbcTemplate jdbcTemplate;
	private final JsonMapper jsonMapper;
	private final JobService jobService;

	record Fingerprint(long expectedVersion) {
	}

	// 판정 순서: 키 형식 400(키를 보냈을 때만) → 본문 400 → 비멤버 404 → 코스 version 409 → 시간 없는 구간 없음 422 → 등록.
	// Idempotency-Key는 선택이다(2026-11-11 결정). 작업이 두 번 생겨도 같은 구간을 같은 값으로 채울 뿐이라 데이터가 깨지지 않고,
	// 프론트(features/course/api.ts recalculateRoutes)가 키 없이 부른다. 키를 보내면 같은 키·같은 본문 재요청에 처음 JobRef를 돌려준다
	@Transactional
	public JobRef request(UUID userId, UUID tripId, String idempotencyKey, RouteRecalculationRequest request) {
		if (idempotencyKey != null) {
			idempotencyService.validateKey(idempotencyKey);
		}
		if (request == null || request.expectedVersion() == null || request.expectedVersion() < 1) {
			throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
					List.of(new ErrorField("expectedVersion", "조회한 코스의 version을 보내 주세요.")));
		}
		long expectedVersion = request.expectedVersion();
		tripAccessChecker.requireActiveMemberForUpdate(tripId, userId);
		if (idempotencyKey == null) {
			return submit(userId, tripId, expectedVersion);
		}
		return idempotencyService.execute(userId, "POST /api/v1/trips/" + tripId + "/itinerary/routes/recalculate",
				idempotencyKey, new Fingerprint(expectedVersion), JobRef.class, HttpStatus.ACCEPTED,
				() -> submit(userId, tripId, expectedVersion));
	}

	// version·구간 검사 뒤 작업 등록. 키를 보낸 요청은 처음 등록할 때만 여기까지 온다
	private JobRef submit(UUID userId, UUID tripId, long expectedVersion) {
		// 코스를 쓰는 모든 경로가 여행 행을 먼저 잠그므로 이 트랜잭션 동안 version과 구간이 바뀌지 않는다
		Itinerary itinerary = itineraryRepository.findByTripId(tripId)
				.orElseThrow(() -> new IllegalStateException("코스가 없는 여행입니다: " + tripId));
		if (itinerary.getVersion() != expectedVersion) {
			throw new BusinessException(ItineraryErrorCode.VERSION_CONFLICT);
		}
		ArrayNode legs = unavailableLegs(itinerary.getId());
		if (legs.isEmpty()) {
			throw new BusinessException(ItineraryErrorCode.INSUFFICIENT_DATA, "다시 구할 구간이 없습니다.",
					List.of(new ErrorField("legs", "이동 시간이 없는 구간이 없습니다.")));
		}
		ObjectNode input = jsonMapper.createObjectNode().put("expectedVersion", expectedVersion);
		input.set("legs", legs);
		return jobService.submit(new JobSubmission(userId, JobKind.ROUTE_RECALCULATION, tripId, input,
				expectedVersion, null));
	}

	// 시간 없는 구간과 양 끝 장소 좌표. 출발 항목의 day·order 순(명세 GET itinerary의 구간 순서)
	private ArrayNode unavailableLegs(UUID itineraryId) {
		ArrayNode legs = jsonMapper.createArrayNode();
		jdbcTemplate.query("""
				select l.from_item_id, l.to_item_id, l.transport_mode, f.day, f.sequence as from_order,
				       t.sequence as to_order, fp.latitude as from_lat, fp.longitude as from_lng,
				       tp.latitude as to_lat, tp.longitude as to_lng
				from route_legs l
				join itinerary_items f on f.id = l.from_item_id
				join itinerary_items t on t.id = l.to_item_id
				join places fp on fp.id = f.place_id
				join places tp on tp.id = t.place_id
				where l.itinerary_id = ? and l.status = 'UNAVAILABLE'
				order by f.day, f.sequence""", rs -> {
			ObjectNode leg = legs.addObject()
					.put("fromItemId", rs.getObject("from_item_id", UUID.class).toString())
					.put("toItemId", rs.getObject("to_item_id", UUID.class).toString())
					.put("day", rs.getInt("day"))
					.put("fromOrder", rs.getInt("from_order"))
					.put("toOrder", rs.getInt("to_order"))
					.put("transportMode", rs.getString("transport_mode"));
			leg.putObject("from").put("latitude", rs.getDouble("from_lat")).put("longitude", rs.getDouble("from_lng"));
			leg.putObject("to").put("latitude", rs.getDouble("to_lat")).put("longitude", rs.getDouble("to_lng"));
		}, itineraryId);
		return legs;
	}

}
