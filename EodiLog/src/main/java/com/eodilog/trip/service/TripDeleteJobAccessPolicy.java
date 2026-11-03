package com.eodilog.trip.service;

import com.eodilog.job.JobAccessPolicy;
import com.eodilog.job.JobContext;
import com.eodilog.job.JobKind;
import com.eodilog.job.JobSubmission;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

// TRIP_DELETE 권한(명세 §9 정리 작업 권한표). 등록은 논리 삭제된 여행의 멤버(방장 삭제 또는 혼자 남아 나간 사람)만,
// 실행·완료는 여행이 논리 삭제돼 있으면 계속한다(삭제는 되돌릴 수 없어 정책 철회가 없다). 방장 여부는 서비스가 403으로 먼저 거른다
// 조회는 공통 기반이 최초 요청자로 제한하므로 여기서는 요청자인지 다시 확인만 한다
@Component
@RequiredArgsConstructor
public class TripDeleteJobAccessPolicy implements JobAccessPolicy {

	private final JdbcTemplate jdbcTemplate;

	@Override
	public JobKind kind() {
		return JobKind.TRIP_DELETE;
	}

	@Override
	public boolean canSubmit(JobSubmission submission) {
		Integer count = jdbcTemplate.queryForObject("""
				select count(*) from trips t join trip_members m on m.trip_id = t.id
				where t.id = ? and t.deleted_at is not null and m.user_id = ?""",
				Integer.class, submission.tripId(), submission.requestedByUserId());
		return count != null && count == 1;
	}

	@Override
	public boolean canExecute(JobContext context) {
		return deleted(context.submission().tripId());
	}

	@Override
	public boolean canComplete(JobContext context) {
		return deleted(context.submission().tripId());
	}

	@Override
	public boolean canRead(UUID viewerUserId, JobContext context) {
		return viewerUserId.equals(context.submission().requestedByUserId());
	}

	// 공통 기반이 scope·completedCount·failedCount만 남기므로 그대로 넘긴다
	@Override
	public JsonNode publicResult(UUID viewerUserId, JobContext context, JsonNode storedResult) {
		return storedResult;
	}

	private boolean deleted(UUID tripId) {
		Integer count = jdbcTemplate.queryForObject(
				"select count(*) from trips where id = ? and deleted_at is not null", Integer.class, tripId);
		return count != null && count == 1;
	}

}
