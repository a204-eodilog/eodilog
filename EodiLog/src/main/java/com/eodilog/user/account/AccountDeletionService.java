package com.eodilog.user.account;

import com.eodilog.chat.service.OwnMessageCleaner;
import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.job.CleanupScope;
import com.eodilog.job.JobKind;
import com.eodilog.job.JobService;
import com.eodilog.job.JobSubmission;
import com.eodilog.trip.dto.LeaveTripRequest;
import com.eodilog.trip.service.TripMemberService;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/**
 * 회원 탈퇴 접수(Q-11, 백엔드 계획 §23, EODI-310). 한 트랜잭션에서
 * <ol>
 * <li>참여 중인 여행마다 나가기와 같게 처리한다(방장이면 가장 먼저 참여한 동행에게 넘기고, 혼자면 여행 삭제)</li>
 * <li>남는 여행의 내 사진·파일을 숨기고(DELETING) 내 채팅·평가와 함께 ACCOUNT_DELETE 작업에 고정한다</li>
 * <li>세션을 모두 폐기하고 카카오 연결을 끊고(같은 카카오로 새로 가입 가능) 계정을 DEACTIVATED로 바꾼다</li>
 * </ol>
 * 작업 등록은 요청자가 ACTIVE여야 하므로 계정을 바꾸기 전에 한다. 나머지 개인 자료는 작업이 지운다
 */
@Service
public class AccountDeletionService {

	private final JdbcTemplate jdbc;
	private final TripMemberService tripMembers;
	private final OwnMessageCleaner messages;
	private final JobService jobs;
	private final JsonMapper json;
	private final Clock clock;

	public AccountDeletionService(JdbcTemplate jdbc, TripMemberService tripMembers, OwnMessageCleaner messages,
			JobService jobs, JsonMapper json, Clock clock) {
		this.jdbc = jdbc;
		this.tripMembers = tripMembers;
		this.messages = messages;
		this.jobs = jobs;
		this.json = json;
		this.clock = clock;
	}

	@Transactional
	public void delete(UUID userId) {
		// 같은 사람의 두 요청이 겹치지 않게 회원 행을 먼저 잠근다. 이미 탈퇴했으면 인증 단계에서 막히지만 한 번 더 확인한다
		var active = jdbc.queryForList("select id from users where id=? and status='ACTIVE' for update", UUID.class, userId);
		if (active.isEmpty()) throw new BusinessException(CommonErrorCode.UNAUTHENTICATED);

		// 1. 참여 중인 여행 나가기. 버전은 방금 읽은 값으로 넘긴다(나가기가 여행을 잠그고 다시 확인한다)
		var trips = jdbc.query("select t.id,t.version from trip_members m join trips t on t.id=m.trip_id"
				+ " where m.user_id=? and m.status='ACTIVE' and t.deleted_at is null order by t.id",
				(rs, n) -> new Object[] { rs.getObject(1, UUID.class), rs.getLong(2) }, userId);
		for (Object[] trip : trips) {
			tripMembers.leave(userId, (UUID) trip[0], new LeaveTripRequest(false, false, (Long) trip[1]));
		}

		Instant now = clock.instant();
		Timestamp at = Timestamp.from(now);
		// 2. 남는 여행(삭제되지 않은 여행)의 내 사진을 숨긴다. 삭제된 여행은 여행 삭제 작업이 사진까지 지운다
		var photos = jdbc.query("select p.id,p.asset_id from photos p join trip_members m on m.id=p.uploader_member_id"
				+ " join trips t on t.id=p.trip_id where m.user_id=? and p.deleted_at is null and t.deleted_at is null order by p.id for update of p",
				(rs, n) -> new UUID[] { rs.getObject(1, UUID.class), rs.getObject(2, UUID.class) }, userId);
		List<UUID> photoIds = photos.stream().map(p -> p[0]).toList();
		updateIds("update photos set deleted_at=?,version=version+1 where id=any(?)", at, photoIds);
		// 내 파일 전부(여행 사진·프로필·캡처·올리다 만 파일). 삭제된 여행의 사진 파일은 여행 삭제 작업이 맡는다
		List<UUID> assetIds = jdbc.queryForList("select a.id from assets a left join trips t on t.id=a.trip_id"
				+ " where a.owner_user_id=? and a.status in ('PENDING','READY') and (a.trip_id is null or t.deleted_at is null)"
				+ " order by a.id for update of a", UUID.class, userId);
		updateIds("update assets set status='DELETING',deleted_at=? where id=any(?)", at, assetIds);

		// 3. 남는 여행의 내 채팅 본문과 내 방문 평가를 고정한다. 방문 기록은 여행 기록이라 남긴다
		List<UUID> messageIds = new ArrayList<>();
		for (UUID tripId : jdbc.queryForList("select distinct m.trip_id from trip_members m join trips t on t.id=m.trip_id"
				+ " where m.user_id=? and t.deleted_at is null order by m.trip_id", UUID.class, userId)) {
			messageIds.addAll(messages.findOwnMessageIds(tripId, userId));
		}
		List<UUID> reviewIds = jdbc.queryForList("select r.id from reviews r join visits v on v.id=r.visit_id"
				+ " join trip_members m on m.id=v.member_id join trips t on t.id=v.trip_id"
				+ " where m.user_id=? and t.deleted_at is null order by r.id", UUID.class, userId);

		var input = json.createObjectNode().put("userId", userId.toString());
		var assets = input.putArray("assetIds");
		assetIds.forEach(id -> assets.add(id.toString()));
		var reviews = input.putArray("reviewIds");
		reviewIds.forEach(id -> reviews.add(id.toString()));
		jobs.submit(new JobSubmission(userId, JobKind.ACCOUNT_DELETE, null, input, null,
				new CleanupScope(photoIds, messageIds, now)));

		// 4. 로그인 차단: 세션 폐기, 카카오 연결 끊기, 계정 상태 변경
		jdbc.update("update sessions set revoked_at=coalesce(revoked_at,?) where user_id=?", at, userId);
		jdbc.update("delete from oauth_accounts where user_id=?", userId);
		jdbc.update("update users set status='DEACTIVATED',deactivated_at=?,updated_at=? where id=?", at, at, userId);
	}

	private void updateIds(String sql, Timestamp at, List<UUID> ids) {
		if (ids.isEmpty()) return;
		jdbc.update(con -> {
			var statement = con.prepareStatement(sql);
			statement.setTimestamp(1, at);
			statement.setArray(2, con.createArrayOf("uuid", ids.toArray()));
			return statement;
		});
	}

}
