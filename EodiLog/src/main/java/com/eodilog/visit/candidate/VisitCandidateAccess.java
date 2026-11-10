package com.eodilog.visit.candidate;

import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

// 방문 감지 작업의 접수·실행·완료·조회 공통 기준: 삭제되지 않은 여행의 ACTIVE 멤버이고 방문 감지 설정이 OFF가 아니다
@Component
@RequiredArgsConstructor
public class VisitCandidateAccess {

	private final JdbcTemplate jdbc;

	public boolean active(UUID trip, UUID user) {
		return trip != null && user != null && Boolean.TRUE.equals(jdbc.queryForObject(
				"select exists(select 1 from trips t join trip_members m on m.trip_id=t.id where t.id=? and t.deleted_at is null and m.user_id=? and m.status='ACTIVE')",
				Boolean.class, trip, user));
	}

	public boolean disabled(UUID user) {
		return jdbc.queryForList("select visit_detection_mode from user_settings where user_id=?", String.class, user).contains("OFF");
	}

	public boolean allowed(UUID trip, UUID user) {
		return active(trip, user) && !disabled(user);
	}

}
