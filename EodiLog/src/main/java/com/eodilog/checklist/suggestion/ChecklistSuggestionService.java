package com.eodilog.checklist.suggestion;

import com.eodilog.checklist.exception.ChecklistErrorCode;
import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.job.JobKind;
import com.eodilog.job.JobRef;
import com.eodilog.job.JobService;
import com.eodilog.job.JobSubmission;
import com.eodilog.trip.domain.Trip;
import com.eodilog.trip.service.TripAccessChecker;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

// AI 준비물 추천 요청(명세 §6). 제안만 만들고 공동 목록은 바꾸지 않는다. 채택은 ChecklistService.addItem
@Service
@RequiredArgsConstructor
public class ChecklistSuggestionService {

	// 본문에 받는 필드가 없어 같은 키의 요청은 언제나 같은 본문으로 본다
	private static final Map<String, Object> REQUEST_FINGERPRINT = Map.of();

	private final IdempotencyService idempotencyService;
	private final TripAccessChecker tripAccessChecker;
	private final ChecklistSuggestionAccess access;
	private final JobService jobService;
	private final JdbcTemplate jdbcTemplate;
	private final JsonMapper jsonMapper;

	// 판정 순서: 키 형식 400 → 비멤버 404 → 설정 OFF 409 → 등록(같은 키면 처음 JobRef)
	@Transactional
	public JobRef request(UUID userId, UUID tripId, String idempotencyKey) {
		idempotencyService.validateKey(idempotencyKey);
		Trip trip = tripAccessChecker.requireActiveMemberForUpdate(tripId, userId).trip();
		if (access.disabled(userId)) {
			throw new BusinessException(ChecklistErrorCode.AI_FEATURE_DISABLED);
		}
		return idempotencyService.execute(userId, "POST /api/v1/trips/" + tripId + "/checklist-suggestions",
				idempotencyKey, REQUEST_FINGERPRINT, JobRef.class, HttpStatus.ACCEPTED,
				() -> jobService.submit(new JobSubmission(userId, JobKind.CHECKLIST_SUGGESTIONS, tripId,
						snapshot(trip), null, null)));
	}

	// 정책 S-4: 등록 시점의 입력을 고정한다. 여행 행을 잠근 트랜잭션 안이라 기간이 함께 바뀌지 않는다
	// AI에는 일정·장소 이름과 준비물 이름만 보낸다. 주소·좌표·멤버 정보는 보내지 않는다
	private ObjectNode snapshot(Trip trip) {
		UUID tripId = trip.getId();
		ObjectNode input = jsonMapper.createObjectNode();
		ObjectNode period = input.putObject("trip");
		period.put("startDate", trip.getStartDate() == null ? null : trip.getStartDate().toString());
		period.put("endDate", trip.getEndDate() == null ? null : trip.getEndDate().toString());

		ArrayNode items = input.putArray("items");
		jdbcTemplate.query("""
				select p.id, p.name, i.day, i.start_time, i.stay_minutes
				from itinerary_items i
				join itineraries it on it.id = i.itinerary_id
				join places p on p.id = i.place_id
				where it.trip_id = ?
				order by i.day, i.sequence""", rs -> {
			ObjectNode item = items.addObject();
			// 장소 분류(category)는 아직 places에 없다(AI spec §11 요청 1)
			item.putObject("place")
					.put("id", rs.getObject("id", UUID.class).toString())
					.put("name", rs.getString("name"))
					.putNull("category");
			item.put("day", rs.getInt("day"));
			item.put("startTime", rs.getString("start_time"));
			Integer stayMinutes = rs.getObject("stay_minutes", Integer.class);
			if (stayMinutes == null) {
				item.putNull("stayMinutes");
			} else {
				item.put("stayMinutes", stayMinutes);
			}
		}, tripId);

		ArrayNode existingItems = input.putArray("existingItems");
		jdbcTemplate.query("""
				select label, source, modified_by_user from checklist_items
				where trip_id = ? and deleted_at is null
				order by created_at, id""", rs -> {
			existingItems.addObject()
					.put("label", rs.getString("label"))
					.put("source", rs.getString("source"))
					.put("modifiedByUser", rs.getBoolean("modified_by_user"));
		}, tripId);

		// 지운 항목은 다시 제안하지 않는다(정책 C-2). 같은 이름은 한 번만 보낸다
		ArrayNode deletedLabels = input.putArray("deletedLabels");
		jdbcTemplate.query("""
				select label from checklist_items
				where trip_id = ? and deleted_at is not null
				group by label
				order by min(created_at), label""", rs -> {
			deletedLabels.add(rs.getString("label"));
		}, tripId);
		return input;
	}

}
