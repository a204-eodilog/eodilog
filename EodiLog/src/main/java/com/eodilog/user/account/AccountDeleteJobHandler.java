package com.eodilog.user.account;

import com.eodilog.chat.service.OwnMessageCleaner;
import com.eodilog.global.storage.ObjectStorage;
import com.eodilog.job.*;
import java.sql.Array;
import java.time.Clock;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * ACCOUNT_DELETE(Q-11, 백엔드 계획 §23). 접수가 여행을 나가고 내 사진·파일을 숨긴(DELETING) 뒤 고정한 범위를 지운다.
 * <ul>
 * <li>execute: 고정한 파일의 저장소 객체를 지운다(트랜잭션 밖, 하나씩 끝난 것을 기록해 재시도 때 건너뛴다)</li>
 * <li>complete: 채팅 본문, 사진 행, 방문 평가, 개인 자료(즐겨찾기·내가 저장한 장소·설정·취향·알림·좋아요·팔로우·추천 숨김·요청 기록·세션),
 * 회원 개인 정보를 지운다. 경비·투표·코스·체크·방문 기록과 멤버십 행은 여행 기록이라 남기고 작성자는 "탈퇴한 사용자"로 보인다</li>
 * </ul>
 * 이미 지운 대상은 건너뛰므로 같은 작업을 다시 돌려도 멱등하다. 진행 중이던 탈퇴자의 다른 작업은 worker가 POLICY_REVOKED로 끝낸다
 */
@Component
public class AccountDeleteJobHandler implements JobHandler {

	static final List<String> INPUT = List.of("userId", "assetIds", "reviewIds");

	private final JdbcTemplate jdbc;
	private final ObjectStorage storage;
	private final OwnMessageCleaner messages;
	private final JsonMapper json;
	private final Clock clock;

	public AccountDeleteJobHandler(JdbcTemplate jdbc, ObjectStorage storage, OwnMessageCleaner messages, JsonMapper json,
			Clock clock) {
		this.jdbc = jdbc;
		this.storage = storage;
		this.messages = messages;
		this.json = json;
		this.clock = clock;
	}

	@Override
	public JobKind kind() {
		return JobKind.ACCOUNT_DELETE;
	}

	@Override
	public void validate(JobSubmission s) {
		var input = s.input();
		if (s.tripId() != null || s.baseVersion() != null || input.size() != INPUT.size() || !INPUT.stream().allMatch(input::has)
				|| !input.path("userId").isString() || !UUID.fromString(input.path("userId").asString()).equals(s.requestedByUserId()))
			throw new IllegalArgumentException("Invalid ACCOUNT_DELETE submission");
		ids(input, "assetIds");
		ids(input, "reviewIds");
	}

	@Override
	public JobOutcome execute(JobContext c) {
		var pending = jdbc.query(con -> {
			var statement = con.prepareStatement("select id,object_key,display_key from assets"
					+ " where id=any(?) and status='DELETING' and objects_deleted=false order by id");
			statement.setArray(1, uuids(con, ids(c.submission().input(), "assetIds")));
			return statement;
		}, (rs, row) -> new String[] { rs.getString(1), rs.getString(2), rs.getString(3) });
		try {
			for (var asset : pending) {
				storage.delete(asset[1]);
				if (asset[2] != null) storage.delete(asset[2]);
				jdbc.update("update assets set objects_deleted=true where id=?", UUID.fromString(asset[0]));
			}
		} catch (RuntimeException failure) {
			return JobOutcome.failed(JobFailure.TEMPORARY_FAILURE);
		}
		var scope = c.submission().cleanupScope();
		long count = scope.photoIds().size() + scope.messageIds().size() + c.submission().input().path("reviewIds").size();
		return JobOutcome.succeeded(json.createObjectNode().put("scope", kind().name()).put("completedCount", count).put("failedCount", 0));
	}

	@Override
	public void complete(JobContext c, JsonNode result) {
		var s = c.submission();
		UUID user = s.requestedByUserId();
		var photos = s.cleanupScope().photoIds();
		// 채팅: 고정한 내 메시지 본문만 지운다(여행 삭제로 이미 사라진 행은 건너뛴다)
		messages.removeBodies(s.cleanupScope().messageIds(), user, clock.instant());
		// 사진: 방문 후보 연결·주제를 먼저 지우고 숨긴 사진 행을 지운다. 파일 행은 남기고 정리 작업이 나중에 지운다
		update("delete from visit_candidate_photos where photo_id=any(?)", photos);
		update("delete from photo_topics where photo_id=any(?)", photos);
		update("delete from photos where id=any(?) and deleted_at is not null", photos);
		update("update assets set objects_deleted=true where id=any(?) and status='DELETING'", ids(s.input(), "assetIds"));
		// 방문 평가(방문 기록은 남긴다)
		update("delete from reviews where id=any(?)", ids(s.input(), "reviewIds"));
		// 개인 자료
		jdbc.update("delete from personal_bookmarks where user_id=?", user);
		jdbc.update("delete from trip_place_saves where saved_by_member_id in (select id from trip_members where user_id=?)", user);
		jdbc.update("delete from user_settings where user_id=?", user);
		jdbc.update("delete from user_preferences where user_id=?", user);
		jdbc.update("delete from user_preference_rejections where user_id=?", user);
		jdbc.update("delete from user_preference_states where user_id=?", user);
		jdbc.update("delete from event_receipts where user_id=?", user);
		jdbc.update("delete from notifications where recipient_user_id=?", user);
		jdbc.update("delete from feed_visibilities where user_id=?", user);
		// 좋아요: 지운 만큼 피드 좋아요 수를 줄인다(좋아요·취소와 같은 규칙)
		jdbc.update("update feeds f set like_count=greatest(f.like_count-1,0) from feed_likes l where l.feed_id=f.id and l.user_id=?", user);
		jdbc.update("delete from feed_likes where user_id=?", user);
		jdbc.update("delete from follows where follower_user_id=? or followee_user_id=?", user, user);
		jdbc.update("delete from suggestion_dismissals where user_id=? or candidate_user_id=?", user, user);
		jdbc.update("delete from idempotency_records where user_id=?", user);
		jdbc.update("delete from sessions where user_id=?", user);
		// 회원 개인 정보. 행은 경비·여행 기록의 작성자 참조 때문에 남기고, 다른 화면에서는 "탈퇴한 사용자"로 보인다
		jdbc.update("update users set nickname='',profile_completed=false,profile_asset_id=null,age_band=null,age_use_consent=false,"
				+ "inference_consent=false,preference_sharing_scope='NONE',account_visibility='PRIVATE' where id=? and status='DEACTIVATED'", user);
	}

	private void update(String sql, List<UUID> ids) {
		if (ids.isEmpty()) return;
		jdbc.update(con -> {
			var statement = con.prepareStatement(sql);
			statement.setArray(1, uuids(con, ids));
			return statement;
		});
	}

	private static Array uuids(java.sql.Connection con, List<?> ids) throws java.sql.SQLException {
		return con.createArrayOf("uuid", ids.toArray());
	}

	static List<UUID> ids(JsonNode input, String field) {
		var node = input.path(field);
		if (!node.isArray()) throw new IllegalArgumentException("Invalid " + field);
		var result = new ArrayList<UUID>();
		node.forEach(v -> {
			if (!v.isString()) throw new IllegalArgumentException("Invalid " + field);
			result.add(UUID.fromString(v.asString()));
		});
		return result;
	}

}
