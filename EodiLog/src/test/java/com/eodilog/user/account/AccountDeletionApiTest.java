package com.eodilog.user.account;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.storage.InMemoryObjectStorage;
import com.eodilog.global.storage.InMemoryStorageConfiguration;
import com.eodilog.job.JobWorker;
import com.eodilog.user.service.UserCardReader;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.json.JsonMapper;

/** 회원 탈퇴(Q-11 A-1~A-10, 백엔드 계획 §23, EODI-310) */
@SpringBootTest
@AutoConfigureMockMvc
@Import({ TestcontainersConfiguration.class, InMemoryStorageConfiguration.class })
class AccountDeletionApiTest {

	@Autowired MockMvc mvc;
	@Autowired JdbcTemplate jdbc;
	@Autowired JsonMapper json;
	@Autowired InMemoryObjectStorage storage;
	@Autowired JobWorker worker;
	@Autowired UserCardReader cards;

	UUID me, mate, fan;

	@BeforeEach
	void setUp() {
		me = user("탈퇴자");
		mate = user("동행");
		fan = user("팬");
	}

	@Test
	void withdrawsAtOnceLeavesTripsAndCleansPersonalDataInTheBackground() throws Exception {
		// 내가 방장인 여행(동행 있음), 동행이 방장인 여행, 나 혼자인 여행
		UUID[] owned = trip(me, mate);
		UUID[] joined = trip(mate, me);
		UUID[] alone = trip(me);
		UUID myPhoto = photo(owned[0], owned[1]), matePhoto = photo(owned[0], owned[2]);
		UUID myAsset = asset(myPhoto), mateAsset = asset(matePhoto);
		UUID myMessage = message(owned[0], me, 1), mateMessage = message(owned[0], mate, 2);
		UUID place = place();
		UUID[] myVisit = visit(owned[0], owned[1], place);
		UUID expense = UUID.randomUUID();
		jdbc.update("insert into expenses(id,trip_id,registered_by_member_id,payer_member_id,title,amount_minor,spent_at,created_at,updated_at)"
				+ " values(?,?,?,?,'dinner',100,now(),now(),now())", expense, owned[0], owned[1], owned[1]);
		jdbc.update("insert into trip_place_saves(trip_id,place_id,saved_by_member_id,created_at,updated_at) values(?,?,?,now(),now())",
				joined[0], place, joined[2]);
		jdbc.update("insert into personal_bookmarks(user_id,place_id,retained_place_name,retained_latitude,retained_longitude,created_at,updated_at)"
				+ " values(?,?,'Place',37,127,now(),now())", me, place);
		jdbc.update("insert into user_settings(user_id) values(?)", me);
		jdbc.update("insert into follows(id,follower_user_id,followee_user_id,status,requested_at,accepted_at) values"
				+ "(?,?,?,'ACCEPTED',now(),now()),(?,?,?,'ACCEPTED',now(),now())", UUID.randomUUID(), me, fan, UUID.randomUUID(), fan, me);
		UUID feed = UUID.randomUUID();
		jdbc.update("insert into feeds(id,trip_id,title,body,published_at,snapshot_json,like_count) values(?,?,'Feed','',now(),'{}',2)", feed, joined[0]);
		jdbc.update("insert into feed_likes(feed_id,user_id,created_at) values(?,?,now()),(?,?,now())", feed, me, feed, fan);
		UUID profile = profileAsset();
		jdbc.update("insert into sessions(id,user_id,refresh_token_hash,expires_at,created_at) values(?,?,?,now()+interval '1 day',now())",
				UUID.randomUUID(), me, "hash-" + UUID.randomUUID());
		jdbc.update("insert into oauth_accounts(id,user_id,provider,provider_user_id,created_at) values(?,?,'KAKAO',?,now())",
				UUID.randomUUID(), me, "kakao-" + me);

		mvc.perform(delete("/api/v1/me").with(authUser(me))).andExpect(status().isAccepted()).andExpect(jsonPath("$.data.accepted").value(true));

		// 즉시: 계정 비활성·세션 폐기·카카오 연결 해제
		assertThat(one("select status from users where id=?", me)).isEqualTo("DEACTIVATED");
		assertThat(count("select count(*) from sessions where user_id=? and revoked_at is null", me)).isZero();
		assertThat(count("select count(*) from oauth_accounts where user_id=?", me)).isZero();
		// 즉시: 여행 나가기 — 방장 넘김, 일반 나가기, 혼자면 여행 삭제
		assertThat(one("select owner_user_id::text from trips where id=?", owned[0])).isEqualTo(mate.toString());
		assertThat(one("select status from trip_members where id=?", owned[1])).isEqualTo("LEFT");
		assertThat(one("select status from trip_members where id=?", joined[2])).isEqualTo("LEFT");
		assertThat(count("select count(*) from trips where id=? and deleted_at is not null", alone[0])).isEqualTo(1);
		// 즉시: 내 사진·파일은 숨김
		assertThat(count("select count(*) from photos where id=? and deleted_at is not null", myPhoto)).isEqualTo(1);
		assertThat(one("select status from assets where id=?", profile)).isEqualTo("DELETING");
		UUID job = jdbc.queryForObject("select id from jobs where kind='ACCOUNT_DELETE' and requested_by_user_id=?", UUID.class, me);
		mvc.perform(get("/api/v1/jobs/{id}", job).with(authUser(me))).andExpect(status().isNotFound());

		runToSuccess(job);

		// 사진·파일·채팅 본문·평가 삭제
		assertThat(count("select count(*) from photos where id=?", myPhoto)).isZero();
		assertThat(storage.contains("display/" + myAsset)).isFalse();
		assertThat(storage.contains("profile/" + profile)).isFalse();
		assertThat(one("select coalesce(text,'(삭제)') from messages where id=?", myMessage)).isEqualTo("(삭제)");
		assertThat(count("select count(*) from reviews where id=?", myVisit[1])).isZero();
		// 개인 자료·관계 삭제, 좋아요 수 감소
		for (String sql : List.of("select count(*) from personal_bookmarks where user_id=?", "select count(*) from user_settings where user_id=?",
				"select count(*) from feed_likes where user_id=?", "select count(*) from sessions where user_id=?",
				"select count(*) from trip_place_saves where saved_by_member_id in (select id from trip_members where user_id=?)"))
			assertThat(count(sql, me)).as(sql).isZero();
		assertThat(count("select count(*) from follows where follower_user_id=? or followee_user_id=?", me, me)).isZero();
		assertThat(count("select like_count from feeds where id=?", feed)).isEqualTo(1);
		// 남기는 것: 경비, 방문 기록, 멤버십, 동행 자료
		assertThat(count("select count(*) from expenses where id=? and deleted_at is null", expense)).isEqualTo(1);
		assertThat(count("select count(*) from visits where id=?", myVisit[0])).isEqualTo(1);
		assertThat(count("select count(*) from photos where id=? and deleted_at is null", matePhoto)).isEqualTo(1);
		assertThat(storage.contains("display/" + mateAsset)).isTrue();
		assertThat(one("select text from messages where id=?", mateMessage)).isEqualTo("hello");
		// 개인 정보 비움, 다른 화면에서는 "탈퇴한 사용자"
		assertThat(one("select nickname from users where id=?", me)).isEmpty();
		assertThat(cards.findCards(mate, List.of(me)).get(me).nickname()).isEqualTo("탈퇴한 사용자");

		// 같은 작업을 다시 돌려도 남은 자료를 건드리지 않는다
		jdbc.update("update jobs set status='QUEUED',finished_at=null,result_json=null,attempt=0,next_attempt_at=now() where id=?", job);
		runToSuccess(job);
		assertThat(count("select count(*) from photos where id=? and deleted_at is null", matePhoto)).isEqualTo(1);
		assertThat(count("select like_count from feeds where id=?", feed)).isEqualTo(1);
	}

	@Test
	void sameKakaoAccountCanSignUpAgainAsNewUser() throws Exception {
		jdbc.update("insert into oauth_accounts(id,user_id,provider,provider_user_id,created_at) values(?,?,'KAKAO',?,now())",
				UUID.randomUUID(), me, "kakao-again-" + me);
		mvc.perform(delete("/api/v1/me").with(authUser(me))).andExpect(status().isAccepted());
		UUID fresh = user("새 계정");
		jdbc.update("insert into oauth_accounts(id,user_id,provider,provider_user_id,created_at) values(?,?,'KAKAO',?,now())",
				UUID.randomUUID(), fresh, "kakao-again-" + me);
		assertThat(count("select count(*) from oauth_accounts where provider_user_id=?", "kakao-again-" + me)).isEqualTo(1);
	}

	@Test
	void documentsTheEndpoint() throws Exception {
		var docs = json.readTree(mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
		var operation = docs.at("/paths/~1api~1v1~1me/delete");
		assertThat(operation.path("summary").asString()).isEqualTo("회원 탈퇴");
		assertThat(operation.path("responses").has("202")).isTrue();
	}

	private void runToSuccess(UUID job) throws Exception {
		for (int n = 0; n < 50; n++) {
			worker.pollOnce();
			if ("SUCCEEDED".equals(one("select status from jobs where id=?", job))) break;
			Thread.sleep(100);
		}
		assertThat(one("select status from jobs where id=?", job)).isEqualTo("SUCCEEDED");
	}

	/** {tripId, 첫째 멤버 ID, 둘째 멤버 ID...}. 첫째가 방장이고 채팅방·참여를 함께 만든다 */
	private UUID[] trip(UUID... users) {
		UUID trip = UUID.randomUUID(), room = UUID.randomUUID();
		jdbc.update("insert into trips(id,owner_user_id,title,created_at,updated_at) values(?,?,'Trip',now(),now())", trip, users[0]);
		jdbc.update("insert into chat_rooms(id,trip_id,next_sequence,created_at) values(?,?,10,now())", room, trip);
		UUID[] result = new UUID[users.length + 1];
		result[0] = trip;
		for (int i = 0; i < users.length; i++) {
			UUID member = UUID.randomUUID();
			jdbc.update("insert into trip_members(id,trip_id,user_id,join_order,joined_at) values(?,?,?,?,now())", member, trip, users[i], i + 1);
			jdbc.update("insert into chat_participants(room_id,user_id,joined_at) values(?,?,now())", room, users[i]);
			result[i + 1] = member;
		}
		jdbc.update("insert into itineraries(id,trip_id,updated_by_member_id,updated_at) values(?,?,?,now())", UUID.randomUUID(), trip, result[1]);
		return result;
	}

	private UUID photo(UUID trip, UUID member) {
		UUID batch = UUID.randomUUID(), asset = UUID.randomUUID(), photo = UUID.randomUUID();
		UUID owner = jdbc.queryForObject("select user_id from trip_members where id=?", UUID.class, member);
		jdbc.update("insert into photo_upload_batches(id,trip_id,created_by_member_id,file_count,created_at,expires_at) values(?,?,?,1,now(),now()+interval '1 hour')",
				batch, trip, member);
		jdbc.update("insert into assets(id,owner_user_id,trip_id,purpose,object_key,display_key,content_type,display_content_type,byte_size,status,created_at)"
				+ " values(?,?,?,'TRIP_PHOTO',?,?,'image/jpeg','image/jpeg',3,'READY',now())", asset, owner, trip, "original/" + asset, "display/" + asset);
		jdbc.update("insert into photos(id,batch_id,trip_id,uploader_member_id,asset_id,created_at) values(?,?,?,?,?,now())", photo, batch, trip, member, asset);
		storage.put("original/" + asset, new byte[] { 1, 2, 3 }, "image/jpeg");
		storage.put("display/" + asset, new byte[] { 1, 2, 3 }, "image/jpeg");
		return photo;
	}

	private UUID asset(UUID photo) {
		return jdbc.queryForObject("select asset_id from photos where id=?", UUID.class, photo);
	}

	private UUID profileAsset() {
		UUID asset = UUID.randomUUID();
		jdbc.update("insert into assets(id,owner_user_id,purpose,object_key,content_type,byte_size,status,created_at)"
				+ " values(?,?,'PROFILE',?,'image/jpeg',3,'READY',now())", asset, me, "profile/" + asset);
		jdbc.update("update users set profile_asset_id=? where id=?", asset, me);
		storage.put("profile/" + asset, new byte[] { 1, 2, 3 }, "image/jpeg");
		return asset;
	}

	private UUID message(UUID trip, UUID sender, long sequence) {
		UUID id = UUID.randomUUID();
		jdbc.update("insert into messages(id,room_id,sender_user_id,type,sequence,text,client_message_id,created_at)"
				+ " values(?,(select id from chat_rooms where trip_id=?),?,'TEXT',?,'hello',?,now())", id, trip, sender, sequence, UUID.randomUUID());
		return id;
	}

	/** {visitId, reviewId} */
	private UUID[] visit(UUID trip, UUID member, UUID place) {
		UUID visit = UUID.randomUUID(), review = UUID.randomUUID();
		jdbc.update("insert into visits(id,trip_id,member_id,place_id,visited_at,created_at) values(?,?,?,?,now(),now())", visit, trip, member, place);
		jdbc.update("insert into reviews(id,visit_id,score,body,created_at,updated_at) values(?,?,5,'review',now(),now())", review, visit);
		return new UUID[] { visit, review };
	}

	private UUID user(String nickname) {
		UUID id = UUID.randomUUID();
		jdbc.update("insert into users(id,nickname,profile_completed,created_at,updated_at) values(?,?,true,now(),now())", id, nickname);
		return id;
	}

	private UUID place() {
		UUID id = UUID.randomUUID();
		jdbc.update("insert into places(id,name,latitude,longitude,source,created_at,updated_at) values(?,'Place',37,127,'MANUAL',now(),now())", id);
		return id;
	}

	private String one(String sql, Object... args) {
		return jdbc.queryForObject(sql, String.class, args);
	}

	private long count(String sql, Object... args) {
		return jdbc.queryForObject(sql, Long.class, args);
	}

}
