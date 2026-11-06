package com.eodilog.checklist.suggestion;

import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

// 준비물 추천 작업의 등록·실행·완료·조회와 채택이 함께 쓰는 현재 상태 검사. 쓰기 없이 읽기만 한다
@Component
@RequiredArgsConstructor
public class ChecklistSuggestionAccess {

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

	// 정책 S-15: 설정 행이 없으면 기본값 CONFIRM으로 본다. UserSettingsService.get은 행을 만들므로 여기서 쓰지 않는다
	// AUTO는 자동 반영 기준이 정해지기 전이라 CONFIRM과 같게 동작한다(S-12). 막는 것은 OFF뿐이다
	public boolean disabled(UUID userId) {
		List<String> modes = jdbcTemplate.queryForList(
				"select checklist_mode from user_settings where user_id = ?", String.class, userId);
		return !modes.isEmpty() && "OFF".equals(modes.getFirst());
	}

	// 요청자가 아직 이 작업을 진행시킬 수 있는가(등록·실행·완료 공통)
	public boolean requesterAllowed(UUID tripId, UUID requesterId) {
		return activeMember(tripId, requesterId) && !disabled(requesterId);
	}

}
