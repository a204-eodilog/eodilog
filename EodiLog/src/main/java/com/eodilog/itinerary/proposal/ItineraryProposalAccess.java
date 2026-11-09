package com.eodilog.itinerary.proposal;

import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

// 코스 제안 작업의 등록·실행·완료·조회가 함께 쓰는 현재 상태 검사. 쓰기 없이 읽기만 한다
// 코스 AI 설정 열이 없어 설정·동의 검사는 하지 않는다(정책 I-9). 설정이 생기면 여기에 추가한다
@Component
@RequiredArgsConstructor
public class ItineraryProposalAccess {

	private final JdbcTemplate jdbcTemplate;

	// 삭제되지 않은 여행의 ACTIVE 멤버인가
	public boolean activeMember(UUID tripId, UUID userId) {
		if (tripId == null || userId == null) {
			return false;
		}
		return Boolean.TRUE.equals(jdbcTemplate.queryForObject("""
				select exists(select 1 from trips t join trip_members m on m.trip_id = t.id
				where t.id = ? and t.deleted_at is null and m.user_id = ? and m.status = 'ACTIVE')""",
				Boolean.class, tripId, userId));
	}

}
