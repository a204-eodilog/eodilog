package com.eodilog.checklist.suggestion;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

// 채택할 제안을 읽는다(정책 S-10·S-13·S-14). 공통 job 패키지를 고치지 않고 jobs 행을 직접 읽는다
@Component
@RequiredArgsConstructor
public class ChecklistSuggestionReader {

	private final JdbcTemplate jdbcTemplate;
	private final JsonMapper jsonMapper;

	/**
	 * 같은 여행의 성공한 CHECKLIST_SUGGESTIONS 결과를 jobs 행을 잠근 채 읽는다.
	 * 잠금은 같은 작업의 채택끼리만 줄 세운다. worker는 RUNNING 행만 잠그므로 성공한 행과 겹치지 않는다.
	 * 없음·다른 여행·다른 종류·성공 아님(진행 중·실패·취소)·결과 형식 오류는 모두 empty다.
	 */
	@Transactional(propagation = Propagation.MANDATORY)
	public Optional<ChecklistSuggestionResult> lockSucceeded(UUID tripId, UUID jobId) {
		List<String> results = jdbcTemplate.queryForList("""
				select result_json::text from jobs
				where id = ? and trip_id = ? and kind = 'CHECKLIST_SUGGESTIONS' and status = 'SUCCEEDED'
				  and deleted_at is null
				for update""", String.class, jobId, tripId);
		if (results.isEmpty() || results.getFirst() == null) {
			return Optional.empty();
		}
		return ChecklistSuggestionResult.sanitize(jsonMapper.readTree(results.getFirst()), jobId);
	}

}
