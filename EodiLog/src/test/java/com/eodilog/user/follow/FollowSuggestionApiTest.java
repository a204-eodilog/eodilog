package com.eodilog.user.follow;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class FollowSuggestionApiTest {

	@Autowired MockMvc mvc;
	@Autowired JdbcTemplate jdbc;
	@Autowired JsonMapper mapper;

	@Test
	void suggestsCoTravelersFirstThenFollowersWithPublicReasonsOnly() throws Exception {
		UUID me = user(), twoTrips = user(), oneTrip = user(), leftMember = user(), fan = user(), fanAndTraveler = user();
		UUID tripA = trip(me), tripB = trip(me);
		member(tripA, me, "ACTIVE");
		member(tripB, me, "LEFT"); // 내가 나간 여행도 함께한 여행이다
		member(tripA, twoTrips, "ACTIVE");
		member(tripB, twoTrips, "ACTIVE");
		member(tripA, oneTrip, "ACTIVE");
		member(tripA, leftMember, "LEFT");
		member(tripB, fanAndTraveler, "ACTIVE");
		follow(fan, me, "ACCEPTED");
		follow(fanAndTraveler, me, "ACCEPTED");

		JsonNode body = json(list(me, null, 20).andExpect(status().isOk()).andExpect(jsonPath("$.page.hasNext").value(false)));
		List<String> ids = ids(body);
		assertThat(ids.getFirst()).isEqualTo(twoTrips.toString());
		assertThat(ids.subList(1, 4)).containsExactlyInAnyOrder(oneTrip.toString(), leftMember.toString(), fanAndTraveler.toString());
		assertThat(ids.getLast()).isEqualTo(fan.toString());
		assertThat(body.get("data").get(0).get("reason").get("kind").asString()).isEqualTo("CO_TRAVELER");
		assertThat(body.get("data").get(0).get("reason").get("count").asInt()).isEqualTo(2);
		JsonNode last = body.get("data").get(4);
		assertThat(last.get("reason").get("kind").asString()).isEqualTo("FOLLOWS_YOU");
		assertThat(last.get("reason").has("count")).isFalse();
		assertThat(last.get("user").get("followedByStatus").asString()).isEqualTo("ACCEPTED");
		assertThat(last.get("user").has("ageBand")).isFalse();
	}

	@Test
	void excludesFollowedRequestedDismissedUnavailableRemovedAndDeletedTrips() throws Exception {
		UUID me = user(), followed = user(), requested = user(), dismissed = user(), gone = user(), removed = user(),
				deletedTripMate = user(), pendingFan = user(), keep = user();
		UUID trip = trip(me), deleted = trip(me);
		member(trip, me, "ACTIVE");
		for (UUID id : List.of(followed, requested, dismissed, gone, keep)) member(trip, id, "ACTIVE");
		member(trip, removed, "REMOVED");
		member(deleted, me, "ACTIVE");
		member(deleted, deletedTripMate, "ACTIVE");
		jdbc.update("UPDATE trips SET deleted_at=now() WHERE id=?", deleted);
		follow(me, followed, "ACCEPTED");
		follow(me, requested, "REQUESTED");
		follow(pendingFan, me, "REQUESTED"); // 대기 요청을 보낸 사람은 받은 요청 목록에서 처리한다
		jdbc.update("UPDATE users SET status='DEACTIVATED',deactivated_at=now() WHERE id=?", gone);
		dismiss(me, dismissed).andExpect(status().isNoContent());

		assertThat(ids(json(list(me, null, 20)))).containsExactly(keep.toString());

		// 숨김은 영구다. 다시 숨겨도 되고, 언팔로우 뒤에도 다시 나오지 않는다
		dismiss(me, dismissed).andExpect(status().isNoContent());
		dismiss(me, followed).andExpect(status().isNoContent());
		jdbc.update("DELETE FROM follows WHERE follower_user_id=? AND followee_user_id=?", me, followed);
		assertThat(ids(json(list(me, null, 20)))).containsExactly(keep.toString());
		// 숨겨도 검색·팔로우는 그대로 된다
		mvc.perform(get("/api/v1/users/" + dismissed).with(authUser(me))).andExpect(status().isOk());
	}

	@Test
	void pagesWithoutDuplicates() throws Exception {
		UUID me = user();
		List<String> expected = new ArrayList<>();
		UUID trip1 = trip(me), trip2 = trip(me);
		member(trip1, me, "ACTIVE");
		member(trip2, me, "ACTIVE");
		for (int i = 0; i < 3; i++) {
			UUID mate = user();
			member(trip1, mate, "ACTIVE");
			member(trip2, mate, "ACTIVE");
			expected.add(mate.toString());
		}
		for (int i = 0; i < 2; i++) {
			UUID mate = user();
			member(trip1, mate, "ACTIVE");
			expected.add(mate.toString());
		}
		for (int i = 0; i < 2; i++) {
			UUID fan = user();
			follow(fan, me, "ACCEPTED");
			expected.add(fan.toString());
		}
		List<String> seen = new ArrayList<>();
		String cursor = null;
		do {
			JsonNode page = json(list(me, cursor, 2).andExpect(status().isOk()));
			seen.addAll(ids(page));
			cursor = page.get("page").get("hasNext").asBoolean() ? page.get("page").get("nextCursor").asString() : null;
		} while (cursor != null);
		assertThat(seen).hasSize(7).doesNotHaveDuplicates();
		assertThat(seen.subList(0, 3)).containsExactlyInAnyOrderElementsOf(expected.subList(0, 3));
		assertThat(seen.subList(3, 5)).containsExactlyInAnyOrderElementsOf(expected.subList(3, 5));
		assertThat(seen.subList(5, 7)).containsExactlyInAnyOrderElementsOf(expected.subList(5, 7));
	}

	@Test
	void rejectsBadInput() throws Exception {
		UUID me = user();
		dismiss(me, me).andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
		dismiss(me, UUID.randomUUID()).andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("USER_NOT_FOUND"));
		mvc.perform(put("/api/v1/me/follow-suggestion-dismissals/not-uuid").with(authUser(me))).andExpect(status().isBadRequest());
		list(me, null, 0).andExpect(status().isBadRequest());
		list(me, null, 51).andExpect(status().isBadRequest());
		list(me, "broken!", 20).andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.fields[0].field").value("cursor"));
		list(me, null, 20).andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(0));
	}

	@Test
	void openApiDocumentsSuggestionEndpoints() throws Exception {
		String body = mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
		var paths = mapper.readTree(body).get("paths");
		assertThat(paths.get("/api/v1/me/follow-suggestions").has("get")).isTrue();
		assertThat(paths.get("/api/v1/me/follow-suggestion-dismissals/{userId}").has("put")).isTrue();
		assertThat(body).contains("FollowSuggestion", "CO_TRAVELER", "FOLLOWS_YOU");
	}

	private UUID user() {
		UUID id = UUID.randomUUID();
		jdbc.update("INSERT INTO users(id,nickname,profile_completed,account_visibility,created_at,updated_at) VALUES(?,?,true,'PUBLIC',now(),now())",
				id, "s" + id.toString().substring(0, 8));
		return id;
	}

	private UUID trip(UUID owner) {
		UUID id = UUID.randomUUID();
		jdbc.update("INSERT INTO trips(id,owner_user_id,title,created_at,updated_at) VALUES(?,?,'추천 여행',now(),now())", id, owner);
		return id;
	}

	private void member(UUID trip, UUID user, String status) {
		Integer next = jdbc.queryForObject("SELECT COALESCE(max(join_order),0)+1 FROM trip_members WHERE trip_id=?", Integer.class, trip);
		jdbc.update("INSERT INTO trip_members(id,trip_id,user_id,status,join_order,joined_at,left_at) VALUES(?,?,?,?,?,now(),"
				+ ("ACTIVE".equals(status) ? "NULL" : "now()") + ")", UUID.randomUUID(), trip, user, status, next);
	}

	private void follow(UUID follower, UUID followee, String status) {
		jdbc.update("INSERT INTO follows(id,follower_user_id,followee_user_id,status,requested_at,accepted_at) VALUES(?,?,?,?,now(),"
				+ ("ACCEPTED".equals(status) ? "now()" : "NULL") + ")", UUID.randomUUID(), follower, followee, status);
	}

	private ResultActions list(UUID me, String cursor, int limit) throws Exception {
		var request = get("/api/v1/me/follow-suggestions").param("limit", String.valueOf(limit)).with(authUser(me));
		if (cursor != null) request.param("cursor", cursor);
		return mvc.perform(request);
	}

	private ResultActions dismiss(UUID me, UUID target) throws Exception {
		return mvc.perform(put("/api/v1/me/follow-suggestion-dismissals/" + target).with(authUser(me)));
	}

	private JsonNode json(ResultActions result) throws Exception {
		return mapper.readTree(result.andReturn().getResponse().getContentAsString());
	}

	private static List<String> ids(JsonNode page) {
		List<String> ids = new ArrayList<>();
		page.get("data").forEach(n -> ids.add(n.get("user").get("id").asString()));
		return ids;
	}

}
