package com.eodilog.itinerary.controller;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.idempotency.IdempotencyService;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// 실제 커밋을 확인해야 하므로 테스트 트랜잭션을 쓰지 않는다. 테스트마다 새 여행·사용자로 자료를 구분한다
// 방장(참여 순 1)·동행(2)이 ACTIVE인 3일짜리 여행(12/1~12/3)에서 확인한다. 장소는 places에 MANUAL 행으로 직접 넣는다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class ItineraryApiTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private JsonMapper jsonMapper;

	private UUID ownerId;
	private UUID friendId;
	private UUID tripId;
	private UUID ownerMemberId;
	private UUID friendMemberId;

	@BeforeEach
	void setUp() throws Exception {
		ownerId = insertUser("방장");
		friendId = insertUser("동행");
		tripId = createTrip("{\"title\":\"제주\",\"startDate\":\"2026-12-01\",\"endDate\":\"2026-12-03\"}");
		ownerMemberId = jdbcTemplate.queryForObject(
				"select id from trip_members where trip_id = ? and user_id = ?", UUID.class, tripId, ownerId);
		friendMemberId = insertMember(tripId, friendId, 2, "ACTIVE");
	}

	@Test
	void returnsEmptyItineraryForNewTrip() throws Exception {
		getItinerary(friendId)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.tripId").value(tripId.toString()))
				.andExpect(jsonPath("$.data.version").value(1))
				.andExpect(jsonPath("$.data.items", hasSize(0)))
				.andExpect(jsonPath("$.data.legs", hasSize(0)))
				.andExpect(jsonPath("$.data.updatedByMemberId").value(ownerMemberId.toString()))
				.andExpect(jsonPath("$.data.updatedAt").isNotEmpty());
	}

	@Test
	void replacesItineraryKeepsExistingIdsAndBumpsVersion() throws Exception {
		UUID a = insertPlace();
		UUID b = insertPlace();
		UUID c = insertPlace();

		// 동행이 1일차 a→b, 2일차 c로 채운다. 순서와 상관없이 보내도 날짜·순서로 정렬된다
		JsonNode first = data(replace(friendId, 1,
				items(item(null, c, 2, 1, null, null), item(null, b, 1, 2, null, 60), item(null, a, 1, 1, "10:00", 90)),
				legs(leg(1, 1, 2, "TRANSIT")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.version").value(2))
				.andExpect(jsonPath("$.data.updatedByMemberId").value(friendMemberId.toString()))
				.andExpect(jsonPath("$.data.items", hasSize(3)))
				.andExpect(jsonPath("$.data.items[*].place.id", contains(a.toString(), b.toString(), c.toString())))
				.andExpect(jsonPath("$.data.items[0].day").value(1))
				.andExpect(jsonPath("$.data.items[0].order").value(1))
				.andExpect(jsonPath("$.data.items[0].startTime").value("10:00"))
				.andExpect(jsonPath("$.data.items[0].stayMinutes").value(90))
				.andExpect(jsonPath("$.data.items[0].place.name").value("장소"))
				.andExpect(jsonPath("$.data.items[0].place.source").value("MANUAL"))
				.andExpect(jsonPath("$.data.items[0].place.latitude").value(33.4996213))
				.andExpect(jsonPath("$.data.items[1].startTime").isEmpty())
				.andExpect(jsonPath("$.data.items[2].stayMinutes").isEmpty())
				.andExpect(jsonPath("$.data.legs", hasSize(1)))
				.andExpect(jsonPath("$.data.legs[0].transportMode").value("TRANSIT"))
				.andExpect(jsonPath("$.data.legs[0].status").value("UNAVAILABLE"))
				.andExpect(jsonPath("$.data.legs[0].durationSeconds").isEmpty())
				.andExpect(jsonPath("$.data.legs[0].distanceMeters").isEmpty())
				.andExpect(jsonPath("$.data.legs[0].geometry").isEmpty())
				.andExpect(jsonPath("$.data.legs[0].queriedAt").isNotEmpty()));
		String aItem = itemId(first, 0);
		String bItem = itemId(first, 1);
		String cItem = itemId(first, 2);
		assertThat(first.get("legs").get(0).get("fromItemId").asString()).isEqualTo(aItem);
		assertThat(first.get("legs").get(0).get("toItemId").asString()).isEqualTo(bItem);
		assertThat(UUID.fromString(aItem).version()).isEqualTo(7);

		// 방장이 a·b의 순서를 맞바꾸고 c를 빼고 d를 더한다. id를 보낸 항목은 유지되고 구간은 새 순서에 다시 연결된다
		UUID d = insertPlace();
		JsonNode second = data(replace(ownerId, 2,
				items(item(bItem, b, 1, 1, null, 60), item(aItem, a, 1, 2, "11:00", 90), item(null, d, 1, 3, null, null)),
				legs(leg(1, 1, 2, "WALK"), leg(1, 2, 3, "CAR")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.version").value(3))
				.andExpect(jsonPath("$.data.updatedByMemberId").value(ownerMemberId.toString()))
				.andExpect(jsonPath("$.data.items[0].id").value(bItem))
				.andExpect(jsonPath("$.data.items[1].id").value(aItem))
				.andExpect(jsonPath("$.data.items[1].startTime").value("11:00"))
				.andExpect(jsonPath("$.data.legs[*].transportMode", contains("WALK", "CAR"))));
		assertThat(itemId(second, 2)).isNotIn(aItem, bItem, cItem);
		assertThat(second.get("legs").get(0).get("fromItemId").asString()).isEqualTo(bItem);
		assertThat(second.get("legs").get(0).get("toItemId").asString()).isEqualTo(aItem);
		assertThat(second.get("legs").get(1).get("fromItemId").asString()).isEqualTo(aItem);
		assertThat(second.get("legs").get(1).get("toItemId").asString()).isEqualTo(itemId(second, 2));
		assertThat(count("select count(*) from itinerary_items i join itineraries t on t.id = i.itinerary_id"
				+ " where t.trip_id = ?", tripId)).isEqualTo(3);
		assertThat(count("select count(*) from route_legs l join itineraries t on t.id = l.itinerary_id"
				+ " where t.trip_id = ?", tripId)).isEqualTo(2);
		assertThat(count("select count(*) from itinerary_items where id = ?", UUID.fromString(cItem))).isZero();

		getItinerary(friendId)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.version").value(3))
				.andExpect(jsonPath("$.data.items", hasSize(3)))
				.andExpect(jsonPath("$.data.legs", hasSize(2)));

		// 남는 항목이 비운 자리(1일차 1번)에 새 항목을 넣는다. 삽입이 갱신보다 먼저 flush돼도 유일 제약은 커밋 때 검사한다
		UUID e = insertPlace();
		String dItem = itemId(second, 2);
		replace(ownerId, 3,
				items(item(null, e, 1, 1, null, null), item(bItem, b, 1, 2, null, 60), item(aItem, a, 1, 3, "11:00", 90),
						item(dItem, d, 1, 4, null, null)),
				legs(leg(1, 1, 2, "WALK"), leg(1, 2, 3, "WALK"), leg(1, 3, 4, "CAR")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.version").value(4))
				.andExpect(jsonPath("$.data.items[0].place.id").value(e.toString()))
				.andExpect(jsonPath("$.data.items[*].id", contains(
						org.hamcrest.Matchers.not(bItem), org.hamcrest.Matchers.is(bItem),
						org.hamcrest.Matchers.is(aItem), org.hamcrest.Matchers.is(dItem))))
				.andExpect(jsonPath("$.data.legs", hasSize(3)));

		// 빈 배열이면 코스를 비운다
		replace(ownerId, 4, "[]", "[]")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.version").value(5))
				.andExpect(jsonPath("$.data.items", hasSize(0)))
				.andExpect(jsonPath("$.data.legs", hasSize(0)));
	}

	@Test
	void keepsVersionWhenNothingChanged() throws Exception {
		UUID a = insertPlace();
		UUID b = insertPlace();
		JsonNode saved = data(replace(friendId, 1, items(item(null, a, 1, 1, "09:30", null), item(null, b, 1, 2, null, 30)),
				legs(leg(1, 1, 2, "WALK"))).andExpect(status().isOk()));
		String aItem = itemId(saved, 0);
		String bItem = itemId(saved, 1);

		// 같은 내용을 방장이 다시 보내도 version과 마지막 편집자는 그대로다(P-8)
		replace(ownerId, 2, items(item(aItem, a, 1, 1, "09:30", null), item(bItem, b, 1, 2, null, 30)),
				legs(leg(1, 1, 2, "WALK")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.version").value(2))
				.andExpect(jsonPath("$.data.updatedByMemberId").value(friendMemberId.toString()));

		// 이동 수단만 바뀌어도 변경이다
		replace(ownerId, 2, items(item(aItem, a, 1, 1, "09:30", null), item(bItem, b, 1, 2, null, 30)),
				legs(leg(1, 1, 2, "CAR")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.version").value(3))
				.andExpect(jsonPath("$.data.updatedByMemberId").value(ownerMemberId.toString()));
	}

	@Test
	void rejectsInvalidItemInput() throws Exception {
		UUID a = insertPlace();
		UUID b = insertPlace();

		expectField(send(ownerId, "{\"items\":[],\"legs\":[]}"), "expectedVersion");
		expectField(send(ownerId, "{\"expectedVersion\":1,\"legs\":[]}"), "items");
		expectField(send(ownerId, "{\"expectedVersion\":1,\"items\":[]}"), "legs");
		expectField(replace(ownerId, 1, items(item(null, null, 1, 1, null, null)), "[]"), "items[0].placeId");
		// 필드를 아예 빼도 400이다(null 언박싱 500 방지)
		expectField(replace(ownerId, 1, "[{\"placeId\":\"%s\",\"order\":1}]".formatted(a), "[]"), "items[0].day");
		expectField(replace(ownerId, 1, "[{\"placeId\":\"%s\",\"day\":1}]".formatted(a), "[]"), "items[0].order");
		expectField(replace(ownerId, 1, "[{}]", "[]"), "items[0].placeId");
		expectField(replace(ownerId, 1, "[null]", "[]"), "items[0]");
		expectField(replace(ownerId, 1, items(item(null, a, 1, 1, null, null), item(null, b, 1, 2, null, null)),
				"[{\"day\":1,\"toOrder\":2,\"transportMode\":\"WALK\"}]"), "legs[0].fromOrder");
		expectField(replace(ownerId, 1, items(item(null, a, 1, 1, null, null), item(null, b, 1, 2, null, null)),
				"[{}]"), "legs[0].day");
		expectField(replace(ownerId, 1, items(item(null, a, 1, 1, null, null), item(null, b, 1, 2, null, null)),
				"[null]"), "legs[0]");
		expectField(replace(ownerId, 1, items(item(null, a, 0, 1, null, null)), "[]"), "items[0].day");
		expectField(replace(ownerId, 1, items(item(null, a, 1, 0, null, null)), "[]"), "items[0].order");
		expectField(replace(ownerId, 1, items(item(null, a, 1, 1, "25:00", null)), "[]"), "items[0].startTime");
		expectField(replace(ownerId, 1, items(item(null, a, 1, 1, "9:00", null)), "[]"), "items[0].startTime");
		expectField(replace(ownerId, 1, items(item(null, a, 1, 1, null, 0)), "[]"), "items[0].stayMinutes");
		expectField(replace(ownerId, 1, items(item(null, a, 1, 1, null, 1441)), "[]"), "items[0].stayMinutes");
		// 날짜별 order는 1부터 빈틈없이
		expectField(replace(ownerId, 1, items(item(null, a, 1, 1, null, null), item(null, b, 1, 3, null, null)), "[]"),
				"items");
		expectField(replace(ownerId, 1, items(item(null, a, 1, 2, null, null)), "[]"), "items");
		// 없는 장소, 다른 코스의 항목 id, 같은 id 두 번
		expectField(replace(ownerId, 1, items(item(null, UUID.randomUUID(), 1, 1, null, null)), "[]"),
				"items[0].placeId");
		expectField(replace(ownerId, 1, items(item(UUID.randomUUID().toString(), a, 1, 1, null, null)), "[]"),
				"items[0].id");
		String same = UUID.randomUUID().toString();
		expectField(replace(ownerId, 1, items(item(same, a, 1, 1, null, null), item(same, b, 1, 2, null, null)),
				legs(leg(1, 1, 2, "WALK"))), "items[1].id");
		// 3일짜리 여행에 4일차는 못 넣는다. 구간 입력 자체의 오류는 400이다
		expectField(replace(ownerId, 1, items(item(null, a, 4, 1, null, null)), "[]"), "items[0].day");
		expectField(replace(ownerId, 1, items(item(null, a, 1, 1, null, null), item(null, b, 1, 2, null, null)),
				"[{\"day\":1,\"fromOrder\":1,\"toOrder\":2}]"), "legs[0].transportMode");
		expectCode(replace(ownerId, 1, items(item(null, a, 1, 1, null, null), item(null, b, 1, 2, null, null)),
				"[{\"day\":1,\"fromOrder\":1,\"toOrder\":2,\"transportMode\":\"BIKE\"}]"), 400, "VALIDATION_ERROR");
		expectCode(send(ownerId, "{\"expectedVersion\":1,\"items\":[],\"legs\":[],\"title\":\"x\"}"), 400,
				"VALIDATION_ERROR");

		// 실패한 요청은 아무것도 바꾸지 않는다
		getItinerary(ownerId).andExpect(jsonPath("$.data.version").value(1));
	}

	@Test
	void allowsAnyDayWhenTripHasNoDates() throws Exception {
		UUID openTripId = createTrip("{\"title\":\"기간 미정\"}");
		UUID a = insertPlace();
		mockMvc.perform(put("/api/v1/trips/{tripId}/itinerary", openTripId).with(authUser(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body(1, items(item(null, a, 30, 1, null, null)), "[]")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.items[0].day").value(30));
	}

	@Test
	void rejectsLegsThatDoNotMatchItems() throws Exception {
		UUID a = insertPlace();
		UUID b = insertPlace();
		UUID c = insertPlace();
		String three = items(item(null, a, 1, 1, null, null), item(null, b, 1, 2, null, null),
				item(null, c, 1, 3, null, null));

		// 빠진 구간
		expectLegs(replace(ownerId, 1, three, legs(leg(1, 1, 2, "WALK"))), "legs");
		// 인접하지 않은 구간, 거꾸로 된 구간, 없는 날짜의 구간
		expectLegs(replace(ownerId, 1, three, legs(leg(1, 1, 3, "WALK"), leg(1, 1, 2, "WALK"), leg(1, 2, 3, "WALK"))),
				"legs[0]");
		expectLegs(replace(ownerId, 1, three, legs(leg(1, 2, 1, "WALK"), leg(1, 1, 2, "WALK"), leg(1, 2, 3, "WALK"))),
				"legs[0]");
		expectLegs(replace(ownerId, 1, three, legs(leg(1, 1, 2, "WALK"), leg(1, 2, 3, "WALK"), leg(2, 1, 2, "WALK"))),
				"legs[2]");
		// 같은 구간 두 번
		expectLegs(replace(ownerId, 1, three, legs(leg(1, 1, 2, "WALK"), leg(1, 2, 3, "WALK"), leg(1, 1, 2, "CAR"))),
				"legs[2]");
		// 하루에 항목이 하나면 구간이 없어야 한다
		expectLegs(replace(ownerId, 1, items(item(null, a, 1, 1, null, null)), legs(leg(1, 1, 2, "WALK"))), "legs[0]");

		getItinerary(ownerId).andExpect(jsonPath("$.data.version").value(1));
	}

	@Test
	void rejectsStaleVersion() throws Exception {
		UUID a = insertPlace();
		replace(ownerId, 1, items(item(null, a, 1, 1, null, null)), "[]").andExpect(status().isOk());

		expectCode(replace(friendId, 1, items(item(null, a, 2, 1, null, null)), "[]"), 409, "VERSION_CONFLICT");
		expectCode(replace(friendId, 3, "[]", "[]"), 409, "VERSION_CONFLICT");
		getItinerary(ownerId)
				.andExpect(jsonPath("$.data.version").value(2))
				.andExpect(jsonPath("$.data.items[0].day").value(1));
	}

	@Test
	void hidesItineraryFromNonMembers() throws Exception {
		UUID stranger = insertUser("남");
		UUID left = insertUser("나간 사람");
		insertMember(tripId, left, 3, "LEFT");
		UUID a = insertPlace();

		expectTripNotFound(getItinerary(stranger));
		expectTripNotFound(getItinerary(left));
		expectTripNotFound(replace(stranger, 1, items(item(null, a, 1, 1, null, null)), "[]"));
		expectTripNotFound(replace(left, 1, items(item(null, a, 1, 1, null, null)), "[]"));
		expectTripNotFound(mockMvc.perform(get("/api/v1/trips/{tripId}/itinerary", UUID.randomUUID())
				.with(authUser(ownerId))));
		mockMvc.perform(get("/api/v1/trips/{tripId}/itinerary", tripId)).andExpect(status().isUnauthorized());
	}

	@Test
	void appliesOnlyOneOfConcurrentReplaces() throws Exception {
		UUID a = insertPlace();
		UUID b = insertPlace();
		ExecutorService executor = Executors.newFixedThreadPool(2);
		CountDownLatch start = new CountDownLatch(1);
		List<Future<Integer>> results = new ArrayList<>();
		try {
			for (UUID place : List.of(a, b)) {
				Callable<Integer> task = () -> {
					start.await();
					return replace(ownerId, 1, items(item(null, place, 1, 1, null, null)), "[]")
							.andReturn().getResponse().getStatus();
				};
				results.add(executor.submit(task));
			}
			start.countDown();
			List<Integer> statuses = new ArrayList<>();
			for (Future<Integer> result : results) {
				statuses.add(result.get());
			}
			assertThat(statuses).containsExactlyInAnyOrder(200, 409);
		} finally {
			executor.shutdownNow();
		}
		getItinerary(ownerId)
				.andExpect(jsonPath("$.data.version").value(2))
				.andExpect(jsonPath("$.data.items", hasSize(1)));
	}

	@Test
	void documentsItineraryApis() throws Exception {
		mockMvc.perform(get("/v3/api-docs"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/itinerary'].get.tags[0]").value("코스"))
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/itinerary'].get.responses['404'].description")
						.value(containsString("TRIP_NOT_FOUND")))
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/itinerary'].put.responses['409'].description")
						.value(containsString("VERSION_CONFLICT")))
				.andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/itinerary'].put.responses['422'].description")
						.value(containsString("INVALID_ROUTE_LEGS")))
				.andExpect(jsonPath("$.components.schemas.ItineraryWriteRequest.required",
						contains("expectedVersion", "items", "legs")))
				.andExpect(jsonPath("$.components.schemas.ItineraryItemResponse.properties.place").exists());
	}

	private ResultActions getItinerary(UUID userId) throws Exception {
		return mockMvc.perform(get("/api/v1/trips/{tripId}/itinerary", tripId).with(authUser(userId)));
	}

	private ResultActions replace(UUID userId, long expectedVersion, String items, String legs) throws Exception {
		return send(userId, body(expectedVersion, items, legs));
	}

	private ResultActions send(UUID userId, String body) throws Exception {
		return mockMvc.perform(put("/api/v1/trips/{tripId}/itinerary", tripId).with(authUser(userId))
				.contentType(MediaType.APPLICATION_JSON)
				.content(body));
	}

	private String body(long expectedVersion, String items, String legs) {
		return "{\"expectedVersion\":%d,\"items\":%s,\"legs\":%s}".formatted(expectedVersion, items, legs);
	}

	private String items(String... items) {
		return "[" + String.join(",", items) + "]";
	}

	private String legs(String... legs) {
		return "[" + String.join(",", legs) + "]";
	}

	private String item(String id, UUID placeId, int day, int order, String startTime, Integer stayMinutes) {
		List<String> fields = new ArrayList<>();
		if (id != null) {
			fields.add("\"id\":\"%s\"".formatted(id));
		}
		fields.add("\"placeId\":" + (placeId == null ? "null" : "\"" + placeId + "\""));
		fields.add("\"day\":" + day);
		fields.add("\"order\":" + order);
		if (startTime != null) {
			fields.add("\"startTime\":\"%s\"".formatted(startTime));
		}
		if (stayMinutes != null) {
			fields.add("\"stayMinutes\":" + stayMinutes);
		}
		return "{" + String.join(",", fields) + "}";
	}

	private String leg(int day, int fromOrder, int toOrder, String transportMode) {
		return "{\"day\":%d,\"fromOrder\":%d,\"toOrder\":%d,\"transportMode\":\"%s\"}"
				.formatted(day, fromOrder, toOrder, transportMode);
	}

	private String itemId(JsonNode itinerary, int index) {
		return itinerary.get("items").get(index).get("id").asString();
	}

	private UUID createTrip(String body) throws Exception {
		return UUID.fromString(data(mockMvc.perform(post("/api/v1/trips").with(authUser(ownerId))
						.header(IdempotencyService.HEADER_NAME, UUID.randomUUID().toString())
						.contentType(MediaType.APPLICATION_JSON)
						.content(body))
				.andExpect(status().isCreated())).get("id").asString());
	}

	private void expectField(ResultActions result, String field) throws Exception {
		result.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
				.andExpect(jsonPath("$.error.fields[0].field").value(field));
	}

	private void expectLegs(ResultActions result, String field) throws Exception {
		result.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.error.code").value("INVALID_ROUTE_LEGS"))
				.andExpect(jsonPath("$.error.fields[0].field").value(field));
	}

	private void expectCode(ResultActions result, int status, String code) throws Exception {
		result.andExpect(status().is(status))
				.andExpect(jsonPath("$.error.code").value(code));
	}

	private void expectTripNotFound(ResultActions result) throws Exception {
		expectCode(result, 404, "TRIP_NOT_FOUND");
	}

	private JsonNode data(ResultActions result) throws Exception {
		return jsonMapper.readTree(result.andReturn().getResponse().getContentAsString()).get("data");
	}

	private long count(String sql, Object... args) {
		return jdbcTemplate.queryForObject(sql, Long.class, args);
	}

	private UUID insertUser(String nickname) {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into users (id, nickname, profile_completed, created_at, updated_at)
				values (?, ?, true, now(), now())""", id, nickname);
		return id;
	}

	private UUID insertMember(UUID memberTripId, UUID userId, long joinOrder, String status) {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into trip_members (id, trip_id, user_id, status, join_order, joined_at, left_at)
				values (?, ?, ?, ?, ?, now(), case when ? = 'ACTIVE' then null else now() end)""",
				id, memberTripId, userId, status, joinOrder, status);
		return id;
	}

	private UUID insertPlace() {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into places (id, name, latitude, longitude, source, created_at, updated_at)
				values (?, '장소', 33.4996213, 126.5311884, 'MANUAL', now(), now())""", id);
		return id;
	}

}
