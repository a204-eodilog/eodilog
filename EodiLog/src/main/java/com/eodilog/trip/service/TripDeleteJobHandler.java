package com.eodilog.trip.service;

import com.eodilog.job.JobContext;
import com.eodilog.job.JobHandler;
import com.eodilog.job.JobKind;
import com.eodilog.job.JobOutcome;
import com.eodilog.job.JobSubmission;
import com.eodilog.global.storage.ObjectStorage;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// TRIP_DELETE: execute는 원본/표시 객체를 지우고 각 완료 쌍의 DELETING 진행 상태를 독립 저장한다.
// complete는 작업 행 잠금 트랜잭션에서 FK 순서대로 하위 자료를 지운다. 파일 키는 유예 정리를 위해 남긴다.
// 재실행은 이미 지운 쌍을 건너뛰며, 여행 tombstone은 jobs FK와 즉시 404를 유지한다.
@Component
@RequiredArgsConstructor
public class TripDeleteJobHandler implements JobHandler {

	private static final Set<String> REASONS = Set.of(TripDeletionService.REASON_OWNER_DELETE,
			TripDeletionService.REASON_LAST_MEMBER_LEAVE);

	private final JdbcTemplate jdbcTemplate;
	private final JsonMapper jsonMapper;
	private final ObjectStorage objectStorage;

	@Override
	public JobKind kind() {
		return JobKind.TRIP_DELETE;
	}

	@Override
	public void validate(JobSubmission submission) {
		JsonNode input = submission.input();
		if (submission.tripId() == null || input.size() != 2
				|| !submission.tripId().toString().equals(input.path("tripId").asString())
				|| !REASONS.contains(input.path("reason").asString())
				|| !submission.cleanupScope().photoIds().isEmpty() || !submission.cleanupScope().messageIds().isEmpty()) {
			throw new IllegalArgumentException("Invalid TRIP_DELETE submission");
		}
	}

	@Override
	public JobOutcome execute(JobContext context) {
		// The trip is already logically deleted. Failed external deletes throw, so the durable job retries
		// before complete removes child data. Deletion keys remain available to grace-period cleanup.
		var pending = jdbcTemplate.query("select id, object_key, display_key from assets where trip_id = ? and status <> 'DELETING' order by id",
				(rs, row) -> new Object[] {rs.getObject("id", UUID.class), rs.getString("object_key"), rs.getString("display_key")}, context.submission().tripId());
		for (var asset : pending) {
			objectStorage.delete((String)asset[1]);
			objectStorage.delete((String)asset[2]);
			// execute runs outside the completion transaction: persist each finished pair for retries.
			jdbcTemplate.update("update assets set status='DELETING' where id=?", asset[0]);
		}
		// 명세 §9의 최소 정리 result이며 completedCount는 삭제한 여행 수다.
		return JobOutcome.succeeded(jsonMapper.createObjectNode()
				.put("scope", JobKind.TRIP_DELETE.name())
				.put("completedCount", 1)
				.put("failedCount", 0));
	}

	@Override
	public void complete(JobContext context, JsonNode result) {
		UUID tripId = context.submission().tripId();
		// 논리 삭제되지 않은 여행은 지우지 않는다. 0건이면 예외로 전체를 롤백한다
		int tombstone = jdbcTemplate.update(
				"update trips set current_settlement_id = null where id = ? and deleted_at is not null", tripId);
		if (tombstone != 1) {
			throw new IllegalStateException("Trip is not marked deleted");
		}
		// FK 순서: 자식 → 부모. 멤버십은 마지막, 여행 행은 남긴다
		jdbcTemplate.update("delete from photos where trip_id = ?", tripId);
		// A presigned PUT cannot be revoked. Keep deletion tombstones/keys throughout the grace period
		// so cleanup can remove late uploads after this job completes and members disappear.
		jdbcTemplate.update("update assets set status='DELETING', upload_batch_id=null where trip_id = ?", tripId);
		jdbcTemplate.update("delete from photo_upload_batches where trip_id = ?", tripId);
		jdbcTemplate.update("delete from settlement_transfers where settlement_id in (select id from settlements where trip_id = ?)", tripId);
		jdbcTemplate.update("delete from settlement_members where settlement_id in (select id from settlements where trip_id = ?)", tripId);
		jdbcTemplate.update("delete from settlements where trip_id = ?", tripId);
		jdbcTemplate.update("delete from expense_shares where expense_id in (select id from expenses where trip_id = ?)", tripId);
		jdbcTemplate.update("delete from expenses where trip_id = ?", tripId);
		jdbcTemplate.update("delete from trip_destinations where trip_id = ?", tripId);
		jdbcTemplate.update("delete from poll_results where candidate_id in (select c.id from poll_candidates c join polls p on p.id = c.poll_id where p.trip_id = ?)", tripId);
		jdbcTemplate.update("delete from poll_votes where candidate_id in (select c.id from poll_candidates c join polls p on p.id = c.poll_id where p.trip_id = ?)", tripId);
		jdbcTemplate.update("delete from poll_candidates where poll_id in (select id from polls where trip_id = ?)", tripId);
		jdbcTemplate.update("delete from polls where trip_id = ?", tripId);
		jdbcTemplate.update("delete from route_legs where itinerary_id in (select id from itineraries where trip_id = ?)", tripId);
		jdbcTemplate.update("delete from itinerary_items where itinerary_id in (select id from itineraries where trip_id = ?)", tripId);
		jdbcTemplate.update("delete from itineraries where trip_id = ?", tripId);
		// 평가는 방문을 가리키므로 방문보다 먼저 지운다
		jdbcTemplate.update("delete from reviews where visit_id in (select id from visits where trip_id = ?)", tripId);
		jdbcTemplate.update("delete from visits where trip_id = ?", tripId);
		jdbcTemplate.update("delete from checklist_items where trip_id = ?", tripId);
		jdbcTemplate.update("delete from trip_invitations where trip_id = ?", tripId);
		jdbcTemplate.update("delete from messages where room_id in (select id from chat_rooms where trip_id = ?)", tripId);
		jdbcTemplate.update("delete from chat_participants where room_id in (select id from chat_rooms where trip_id = ?)", tripId);
		jdbcTemplate.update("delete from chat_rooms where trip_id = ?", tripId);
		// 이 여행의 다른 작업(AI 변경안 적용 등)이 멤버십을 가리키면 FK 때문에 멤버십을 지울 수 없다. 여행이 사라지므로 그 기록은 비운다
		jdbcTemplate.update("update jobs set applied_by_member_id = null where trip_id = ? and applied_by_member_id is not null",
				tripId);
		jdbcTemplate.update("delete from trip_members where trip_id = ?", tripId);
	}

}
