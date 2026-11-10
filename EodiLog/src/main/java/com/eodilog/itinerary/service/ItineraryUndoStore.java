package com.eodilog.itinerary.service;

import com.eodilog.itinerary.service.CourseWriter.CourseSnapshot;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

// 직전 AI 적용 이전 코스(itinerary_undo_states). 코스당 한 행이며 새 적용이 덮어쓴다(정책 I-19·I-21)
@Component
@RequiredArgsConstructor
public class ItineraryUndoStore {

	private final JdbcTemplate jdbcTemplate;
	private final JsonMapper jsonMapper;

	public record UndoState(UUID appliedJobId, long appliedVersion, CourseSnapshot before) {
	}

	public void save(UUID itineraryId, UUID appliedJobId, long appliedVersion, CourseSnapshot before,
			UUID appliedByMemberId, Instant now) {
		jdbcTemplate.update("""
				insert into itinerary_undo_states
				(itinerary_id, applied_job_id, applied_version, before_content_json, applied_by_member_id, created_at)
				values (?, ?, ?, ?::jsonb, ?, ?)
				on conflict (itinerary_id) do update set
				    applied_job_id = excluded.applied_job_id, applied_version = excluded.applied_version,
				    before_content_json = excluded.before_content_json,
				    applied_by_member_id = excluded.applied_by_member_id, created_at = excluded.created_at""",
				itineraryId, appliedJobId, appliedVersion, jsonMapper.writeValueAsString(before), appliedByMemberId,
				Timestamp.from(now));
	}

	// 코스 행을 잠근 트랜잭션에서 부른다. 코스 행 잠금이 이 행의 쓰기도 직렬화하므로 따로 잠그지 않는다
	public Optional<UndoState> find(UUID itineraryId) {
		List<UndoState> rows = jdbcTemplate.query("""
				select applied_job_id, applied_version, before_content_json::text as before_content_json
				from itinerary_undo_states where itinerary_id = ?""",
				(rs, n) -> new UndoState(rs.getObject("applied_job_id", UUID.class), rs.getLong("applied_version"),
						jsonMapper.readValue(rs.getString("before_content_json"), CourseSnapshot.class)),
				itineraryId);
		return rows.stream().findFirst();
	}

	// 제안 조회의 canUndo 계산용. 스냅샷 본문은 읽지 않는다
	public boolean canUndo(UUID itineraryId, UUID appliedJobId, long currentVersion) {
		return Boolean.TRUE.equals(jdbcTemplate.queryForObject("""
				select exists(select 1 from itinerary_undo_states
				where itinerary_id = ? and applied_job_id = ? and applied_version = ?)""",
				Boolean.class, itineraryId, appliedJobId, currentVersion));
	}

	public void delete(UUID itineraryId) {
		jdbcTemplate.update("delete from itinerary_undo_states where itinerary_id = ?", itineraryId);
	}

}
