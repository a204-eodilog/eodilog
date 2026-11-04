package com.eodilog.trip.service;

import com.eodilog.job.JobAccessPolicy;
import com.eodilog.job.JobContext;
import com.eodilog.job.JobKind;
import com.eodilog.job.JobSubmission;
import java.sql.PreparedStatement;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

// LEAVE_CLEANUP 권한(명세 §9 정리 작업 권한표, 정책 §15). 등록은 방금 그 여행에서 나간(LEFT) 본인이 자기 메시지만 대상으로 할 때,
// 실행·완료는 승인한 정리를 이탈·재참여·여행 삭제로 취소하지 않으므로 항상 계속한다. 조회는 최초 요청자만
@Component
@RequiredArgsConstructor
public class LeaveCleanupJobAccessPolicy implements JobAccessPolicy {

	private final JdbcTemplate jdbcTemplate;

	@Override
	public JobKind kind() {
		return JobKind.LEAVE_CLEANUP;
	}

	@Override
	public boolean canSubmit(JobSubmission submission) {
		Integer left = jdbcTemplate.queryForObject(
				"select count(*) from trip_members where trip_id = ? and user_id = ? and status = 'LEFT'",
				Integer.class, submission.tripId(), submission.requestedByUserId());
		if (left == null || left != 1) {
			return false;
		}
		List<UUID> messageIds = submission.cleanupScope().messageIds();
		Integer own = jdbcTemplate.query(connection -> {
			PreparedStatement statement = connection.prepareStatement("""
					select count(*) from messages m join chat_rooms r on r.id = m.room_id
					where m.id = any(?) and r.trip_id = ? and m.sender_user_id = ? and m.type = 'TEXT'""");
			statement.setArray(1, connection.createArrayOf("uuid", messageIds.toArray()));
			statement.setObject(2, submission.tripId());
			statement.setObject(3, submission.requestedByUserId());
			return statement;
		}, rs -> rs.next() ? rs.getInt(1) : null);
		return own != null && own == messageIds.size();
	}

	@Override
	public boolean canExecute(JobContext context) {
		return true;
	}

	@Override
	public boolean canComplete(JobContext context) {
		return true;
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

}
