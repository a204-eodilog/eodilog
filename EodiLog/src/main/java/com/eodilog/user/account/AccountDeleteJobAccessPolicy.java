package com.eodilog.user.account;

import com.eodilog.job.JobAccessPolicy;
import com.eodilog.job.JobContext;
import com.eodilog.job.JobKind;
import com.eodilog.job.JobSubmission;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

/**
 * ACCOUNT_DELETE 권한. 등록은 탈퇴 접수 트랜잭션에서 본인만(아직 ACTIVE일 때 등록하고 같은 트랜잭션에서 DEACTIVATED가 된다).
 * 실행·완료는 계정이 DEACTIVATED이면 계속한다(탈퇴는 되돌릴 수 없어 정책 철회가 없다). 서버 내부 작업이라 누구도 조회할 수 없다
 */
@Component
public class AccountDeleteJobAccessPolicy implements JobAccessPolicy {

	private final JdbcTemplate jdbc;

	public AccountDeleteJobAccessPolicy(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public JobKind kind() {
		return JobKind.ACCOUNT_DELETE;
	}

	@Override
	public boolean canSubmit(JobSubmission submission) {
		return submission.tripId() == null
				&& submission.requestedByUserId().toString().equals(submission.input().path("userId").asString(""));
	}

	@Override
	public boolean canExecute(JobContext context) {
		return deactivated(context.submission().requestedByUserId());
	}

	@Override
	public boolean canComplete(JobContext context) {
		return deactivated(context.submission().requestedByUserId());
	}

	@Override
	public boolean canRead(UUID viewerUserId, JobContext context) {
		return false;
	}

	@Override
	public JsonNode publicResult(UUID viewerUserId, JobContext context, JsonNode storedResult) {
		return storedResult;
	}

	private boolean deactivated(UUID userId) {
		Integer count = jdbc.queryForObject("select count(*) from users where id=? and status='DEACTIVATED'", Integer.class, userId);
		return count != null && count == 1;
	}

}
