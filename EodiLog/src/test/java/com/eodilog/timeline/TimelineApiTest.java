package com.eodilog.timeline;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.ArgumentMatchers.eq;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.storage.ObjectStorage;
import com.eodilog.trip.service.TripAccessChecker;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, TimelineApiTest.FixedTime.class})
class TimelineApiTest {

	@TestConfiguration(proxyBeanMethods = false)
	static class FixedTime {
		@Bean @Primary Clock timelineClock() {
			// UTC로는 11월 10일이지만 한국은 이미 11월 11일이다.
			return Clock.fixed(Instant.parse("2026-11-10T15:00:00Z"), ZoneOffset.UTC);
		}
	}

	@Autowired MockMvc mvc;
	@Autowired JdbcTemplate jdbc;
	@Autowired JsonMapper mapper;
	@MockitoBean ObjectStorage storage;
	@MockitoSpyBean TripAccessChecker access;
	@Autowired PlatformTransactionManager transactionManager;
	UUID user;
	UUID member;
	UUID trip;
	UUID itinerary;

	@BeforeEach
	void setup() {
		user = user();
		trip = trip("2026-11-11", "2026-11-12");
		member = jdbc.queryForObject("select id from trip_members where trip_id=? and user_id=?", UUID.class, trip, user);
		itinerary = UUID.randomUUID();
		jdbc.update("insert into itineraries(id,trip_id,updated_by_member_id,updated_at) values(?,?,?,now())", itinerary, trip, member);
	}

	@Test
	void pagesAcrossDateTiesAndUndatedGroupWithoutLoss() throws Exception {
		trip("2026-11-11", "2026-11-13");
		trip("2027-01-01", "2027-01-02");
		trip("2026-01-01", "2026-01-02");
		trip(null, null);
		trip(null, null);
		trip(null, null);
		var expected = jdbc.queryForList("select id from trips where owner_user_id=? order by start_date desc nulls last,id desc", UUID.class, user);
		List<UUID> actual = new ArrayList<>();
		String cursor = null;
		do {
			var request = get("/api/v1/me/timeline").with(authUser(user)).param("limit", "1");
			if (cursor != null) request.param("cursor", cursor);
			JsonNode page = body(mvc.perform(request).andExpect(status().isOk()));
			assertThat(page.path("data").size()).isEqualTo(1);
			var item = page.path("data").get(0);
			actual.add(UUID.fromString(item.path("tripId").asString()));
			assertThat(item.path("feedId").isNull()).isTrue();
			assertThat(item.path("dateBasis").asString()).isEqualTo(item.path("date").isNull() ? "UNKNOWN" : "TRIP");
			cursor = page.path("page").path("nextCursor").isNull() ? null : page.path("page").path("nextCursor").asString();
			assertThat(page.path("page").path("hasNext").asBoolean()).isEqualTo(cursor != null);
		} while (cursor != null && actual.size() < 20);
		assertThat(actual).containsExactlyElementsOf(expected);
	}

	@Test
	void usesKoreanDateStatusWithoutWritingStoredStatus() throws Exception {
		list().andExpect(jsonPath("$.data[0].status").value("ONGOING"));
		assertThat(jdbc.queryForObject("select status from trips where id=?", String.class, trip)).isEqualTo("PLANNING");
		jdbc.update("update trips set start_date='2026-11-10',end_date='2026-11-10' where id=?", trip);
		list().andExpect(jsonPath("$.data[0].status").value("COMPLETED"));
		jdbc.update("update trips set start_date=null,end_date=null where id=?", trip);
		list().andExpect(jsonPath("$.data[0].status").value("PLANNING"));
	}

	@Test
	void hidesNonmemberLeftRemovedMissingAndDeletedTrips() throws Exception {
		for (String state : List.of("LEFT", "REMOVED")) {
			UUID stranger = user();
			member(stranger, state, state.equals("LEFT") ? 2 : 3);
			for (String suffix : List.of("timeline", "summary")) denied(stranger, trip, suffix);
			mvc.perform(get("/api/v1/me/timeline").with(authUser(stranger)))
					.andExpect(jsonPath("$.data").isEmpty());
		}
		for (String suffix : List.of("timeline", "summary")) {
			denied(user(), trip, suffix);
			denied(user, UUID.randomUUID(), suffix);
			mvc.perform(get("/api/v1/trips/{id}/" + suffix, trip)).andExpect(status().isUnauthorized());
		}
		mvc.perform(get("/api/v1/me/timeline")).andExpect(status().isUnauthorized());
		jdbc.update("update trips set deleted_at=now() where id=?", trip);
		for (String suffix : List.of("timeline", "summary")) denied(user, trip, suffix);
		list().andExpect(jsonPath("$.data").isEmpty());
	}

	@Test
	void validatesLimitCursorAndTripId() throws Exception {
		for (String limit : List.of("0", "101", "x")) {
			mvc.perform(get("/api/v1/me/timeline").with(authUser(user)).param("limit", limit))
					.andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
		}
		for (String cursor : List.of("", "bad", encoded("2026-99-99|" + trip), encoded("UNKNOWN|1-1-1-1-1"),
				encoded("UNKNOWN|" + trip + "|extra"), encoded("|" + trip))) {
			mvc.perform(get("/api/v1/me/timeline").with(authUser(user)).param("cursor", cursor))
					.andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.fields[0].field").value("cursor"));
		}
		mvc.perform(get("/api/v1/trips/nope/timeline").with(authUser(user))).andExpect(status().isBadRequest());
	}

	@Test
	void rejectsDatesOutsidePostgresRangeAndAcceptsBoundaryAndUnknownCursors() throws Exception {
		for (LocalDate date : List.of(LocalDate.MIN, LocalDate.of(-4713, 12, 31),
				LocalDate.of(5874898, 1, 1), LocalDate.MAX)) {
			mvc.perform(get("/api/v1/me/timeline").with(authUser(user))
					.param("cursor", new TimelineCursor(date, trip).encode()))
					.andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.fields[0].field").value("cursor"));
		}
		for (String key : List.of("-4712-01-01", "+5874897-12-31", "UNKNOWN", "2026-11-11")) {
			mvc.perform(get("/api/v1/me/timeline").with(authUser(user)).param("cursor", encoded(key + "|" + trip)))
					.andExpect(status().isOk());
		}
	}

	@Test
	void activeNonOwnerCanListJoinedTripAndReadBothInternalApis() throws Exception {
		UUID viewer = user();
		jdbc.update("insert into trip_members(id,trip_id,user_id,join_order,joined_at) values(?,?,?,2,now())", UUID.randomUUID(), trip, viewer);
		mvc.perform(get("/api/v1/me/timeline").with(authUser(viewer)))
				.andExpect(status().isOk()).andExpect(jsonPath("$.data[0].tripId").value(trip.toString()))
				.andExpect(jsonPath("$.data.length()").value(1));
		mvc.perform(get("/api/v1/trips/{id}/timeline", trip).with(authUser(viewer)))
				.andExpect(status().isOk()).andExpect(jsonPath("$.data.items").isEmpty());
		mvc.perform(get("/api/v1/trips/{id}/summary", trip).with(authUser(viewer)))
				.andExpect(status().isOk()).andExpect(jsonPath("$.data.tripId").value(trip.toString()));
	}

	@Test
	void summaryKeepsAuthorizationAndRecordsFromOneCommittedSnapshot() throws Exception {
		assertStableSnapshot("summary");
	}

	@Test
	void timelineKeepsAuthorizationAndRecordsFromOneCommittedSnapshot() throws Exception {
		assertStableSnapshot("timeline");
	}

	private void assertStableSnapshot(String suffix) throws Exception {
		UUID a = place(null), b = place(null);
		UUID first = item(a, 1, 1, null), second = item(b, 1, 2, null);
		leg(first, second, 5);
		photo(a, member, false, false);
		visit(a, member, "2026-11-11T01:00:00Z", false);
		expense(member, 10, false);
		// 권한 조회가 만든 snapshot 뒤 별도 연결에서 변경을 실제 커밋한다.
		doAnswer(invocation -> {
			Object accepted = invocation.callRealMethod();
			CompletableFuture.runAsync(() -> new TransactionTemplate(transactionManager).executeWithoutResult(tx -> {
				jdbc.update("update trip_members set status='LEFT',left_at=now() where id=?", member);
				jdbc.update("update photos set deleted_at=now() where trip_id=?", trip);
				jdbc.update("update visits set deleted_at=now() where trip_id=?", trip);
				jdbc.update("update expenses set amount_minor=20 where trip_id=?", trip);
				jdbc.update("update route_legs set distance_meters=99 where itinerary_id=?", itinerary);
				jdbc.update("update places set name='변경된 장소' where id=?", a);
			})).get(10, TimeUnit.SECONDS);
			return accepted;
		}).when(access).requireActiveMember(eq(trip), eq(user));
		if (suffix.equals("summary")) {
			data(suffix).andExpect(jsonPath("$.data.photoCount").value(1))
					.andExpect(jsonPath("$.data.visitedPlaceCount").value(1))
					.andExpect(jsonPath("$.data.totalAmountMinor").value(10))
					.andExpect(jsonPath("$.data.plannedDistanceMeters").value(5));
		} else {
			data(suffix).andExpect(jsonPath("$.data.items[0].photoCount").value(1))
					.andExpect(jsonPath("$.data.items[0].status").value("VISITED"))
					.andExpect(jsonPath("$.data.items[0].place.name").value("장소"))
					.andExpect(jsonPath("$.data.items[0].plannedDistanceMeters").value(5));
		}
		assertThat(jdbc.queryForObject("select amount_minor from expenses where trip_id=?", Long.class, trip)).isEqualTo(20);
		assertThat(jdbc.queryForObject("select distance_meters from route_legs where itinerary_id=?", Integer.class, itinerary)).isEqualTo(99);
		denied(user, trip, suffix);
	}

	@Test
	void emptyTripReturnsNullDistancesAndExpensesWithoutExternalIo() throws Exception {
		data("timeline").andExpect(jsonPath("$.data.items").isEmpty());
		data("summary").andExpect(jsonPath("$.data.photoCount").value(0))
				.andExpect(jsonPath("$.data.visitedPlaceCount").value(0))
				.andExpect(jsonPath("$.data.visitedRegionCount").value(0))
				.andExpect(jsonPath("$.data.plannedDistanceMeters").isEmpty())
				.andExpect(jsonPath("$.data.actualDistanceMeters").isEmpty())
				.andExpect(jsonPath("$.data.totalAmountMinor").isEmpty()).andExpect(jsonPath("$.data.currency").value("KRW"));
		verifyNoInteractions(storage);
	}

	@Test
	void aggregatesOriginalsIndependentlyAndKeepsRepeatedCourseAndOffCourseVisits() throws Exception {
		var regions = jdbc.queryForList("select id from regions order by id limit 2", UUID.class);
		UUID a = place(regions.get(0)), b = place(regions.get(0)), c = place(null), off = place(regions.get(1));
		UUID first = item(a, 1, 1, "09:00"), second = item(b, 1, 2, null), repeated = item(a, 1, 3, "23:30");
		item(c, 2, 1, "00:30");
		leg(first, second, 100);
		leg(second, repeated, 200);
		UUID leaver = member(user(), "LEFT", 2);
		visit(a, member, "2026-11-11T02:00:00Z", false);
		visit(a, leaver, "2026-11-11T01:00:00Z", false);
		visit(a, member, "2026-11-10T01:00:00Z", true);
		visit(b, member, "2026-11-11T03:00:00Z", false);
		visit(off, leaver, "2026-11-11T04:00:00Z", false);
		photo(a, member, false, false);
		photo(a, leaver, false, false);
		photo(off, member, false, false);
		photo(null, member, false, false);
		photo(b, member, true, false);
		photo(b, member, false, true);
		expense(member, 101, false);
		expense(leaver, 202, false);
		expense(member, 999, true);

		data("summary").andExpect(jsonPath("$.data.photoCount").value(4))
				.andExpect(jsonPath("$.data.visitedPlaceCount").value(3))
				.andExpect(jsonPath("$.data.visitedRegionCount").value(2))
				.andExpect(jsonPath("$.data.plannedDistanceMeters").value(300))
				.andExpect(jsonPath("$.data.actualDistanceMeters").isEmpty())
				.andExpect(jsonPath("$.data.totalAmountMinor").value(303));
		JsonNode items = body(data("timeline")).path("data").path("items");
		assertThat(items.size()).isEqualTo(5);
		assertThat(items.get(0).path("place").path("id").asString()).isEqualTo(a.toString());
		assertThat(items.get(2).path("place").path("id").asString()).isEqualTo(a.toString());
		assertThat(items.get(4).path("place").path("id").asString()).isEqualTo(off.toString());
		assertThat(items.get(0).path("plannedAt").asString()).isEqualTo("2026-11-11T00:00:00Z");
		assertThat(items.get(0).path("visitedAt").asString()).isEqualTo("2026-11-11T01:00:00Z");
		assertThat(items.get(0).path("photoCount").asLong()).isEqualTo(2);
		assertThat(items.get(0).path("status").asString()).isEqualTo("VISITED");
		assertThat(items.get(0).path("plannedDistanceMeters").asInt()).isEqualTo(100);
		assertThat(items.get(1).path("plannedAt").isNull()).isTrue();
		assertThat(items.get(2).path("plannedDistanceMeters").isNull()).isTrue();
		assertThat(items.get(3).path("plannedAt").asString()).isEqualTo("2026-11-11T15:30:00Z");
		assertThat(items.get(3).path("status").asString()).isEqualTo("PLANNED");
		assertThat(items.get(4).path("plannedAt").isNull()).isTrue();
		verifyNoInteractions(storage);
		assertThat(jdbc.queryForObject("select count(*) from route_legs where itinerary_id=?", Long.class, itinerary)).isEqualTo(2);
		jdbc.update("update trips set start_date=null,end_date=null where id=?", trip);
		data("timeline").andExpect(jsonPath("$.data.items[0].plannedAt").isEmpty());
	}

	@Test
	void requiresAllSameDayAdjacentLegsAndPreservesZeroDistance() throws Exception {
		UUID a = place(null), b = place(null), c = place(null);
		UUID first = item(a, 1, 1, null), second = item(b, 1, 2, null), third = item(c, 1, 3, null);
		leg(first, second, 70);
		data("summary").andExpect(jsonPath("$.data.plannedDistanceMeters").isEmpty());
		UUID lastLeg = leg(second, third, null);
		data("summary").andExpect(jsonPath("$.data.plannedDistanceMeters").isEmpty());
		data("timeline").andExpect(jsonPath("$.data.items[0].plannedDistanceMeters").value(70))
				.andExpect(jsonPath("$.data.items[1].plannedDistanceMeters").isEmpty());
		jdbc.update("update route_legs set status='AVAILABLE',distance_meters=0,duration_seconds=0 where id=?", lastLeg);
		data("summary").andExpect(jsonPath("$.data.plannedDistanceMeters").value(70));
		jdbc.update("update route_legs set distance_meters=0 where itinerary_id=?", itinerary);
		data("summary").andExpect(jsonPath("$.data.plannedDistanceMeters").value(0));
	}

	@Test
	void excludesOtherTripRecordsAndDoesNotTreatSingletonDaysAsRouteLegs() throws Exception {
		UUID p = place(null);
		item(p, 1, 1, "10:00");
		item(p, 2, 1, "10:00");
		UUID otherTrip = trip(null, null);
		UUID otherMember = jdbc.queryForObject("select id from trip_members where trip_id=?", UUID.class, otherTrip);
		jdbc.update("insert into visits(id,trip_id,member_id,place_id,visited_at,created_at) values(?,?,?,?,now(),now())", UUID.randomUUID(), otherTrip, otherMember, p);
		// 공유 장소라도 타 여행의 사진·경비·길찾기는 현재 여행 집계에 포함하지 않는다.
		UUID currentTrip = trip, currentMember = member, currentItinerary = itinerary;
		try {
			trip = otherTrip;
			member = otherMember;
			itinerary = UUID.randomUUID();
			jdbc.update("insert into itineraries(id,trip_id,updated_by_member_id,updated_at) values(?,?,?,now())", itinerary, trip, member);
			photo(p, member, false, false);
			expense(member, 999, false);
			UUID from = item(p, 1, 1, null), to = item(p, 1, 2, null);
			leg(from, to, 999);
		} finally {
			trip = currentTrip;
			member = currentMember;
			itinerary = currentItinerary;
		}
		data("summary").andExpect(jsonPath("$.data.visitedPlaceCount").value(0))
				.andExpect(jsonPath("$.data.photoCount").value(0))
				.andExpect(jsonPath("$.data.totalAmountMinor").isEmpty())
				.andExpect(jsonPath("$.data.plannedDistanceMeters").isEmpty());
		data("timeline").andExpect(jsonPath("$.data.items[0].status").value("PLANNED"))
				.andExpect(jsonPath("$.data.items[0].photoCount").value(0))
				.andExpect(jsonPath("$.data.items[0].plannedDistanceMeters").isEmpty());
	}

	@Test
	void documentsAllAuthenticatedEndpointsAndFullContracts() throws Exception {
		JsonNode docs = body(mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()));
		for (String path : List.of("/api/v1/me/timeline", "/api/v1/trips/{tripId}/timeline", "/api/v1/trips/{tripId}/summary")) {
			var op = docs.path("paths").path(path).path("get");
			assertThat(op.path("summary").asString()).isNotBlank();
			assertThat(op.path("description").asString()).contains("ACTIVE");
			assertThat(op.path("responses").has("401")).isTrue();
		}
		var schemas = docs.path("components").path("schemas");
		for (String field : List.of("tripId", "photoCount", "visitedPlaceCount", "visitedRegionCount", "plannedDistanceMeters", "actualDistanceMeters", "totalAmountMinor", "currency")) {
			assertThat(schemas.path("TripSummary").path("properties").path(field).path("description").asString()).isNotBlank();
		}
		assertThat(schemas.path("PlaceTimelineItem").path("properties").path("plannedDistanceMeters").path("description").asString()).contains("다음");
		assertThat(schemas.path("TimelineItem").path("properties").has("dateBasis")).isTrue();
		for (var fields : Map.of("TimelineItem", List.of("feedId", "date"),
				"PlaceTimelineItem", List.of("plannedAt", "visitedAt", "plannedDistanceMeters"),
				"TripSummary", List.of("plannedDistanceMeters", "actualDistanceMeters", "totalAmountMinor")).entrySet()) {
			for (String field : fields.getValue()) {
				assertThat(allowsNull(schemas.path(fields.getKey()).path("properties").path(field)))
						.as("%s.%s null 허용", fields.getKey(), field).isTrue();
			}
		}
	}

	private boolean allowsNull(JsonNode schema) {
		if (schema.path("nullable").asBoolean() || (!schema.path("type").isArray() && schema.path("type").asString().equals("null"))) return true;
		for (JsonNode type : schema.path("type")) if (type.asString().equals("null")) return true;
		for (String union : List.of("oneOf", "anyOf")) {
			for (JsonNode alternative : schema.path(union)) if (allowsNull(alternative)) return true;
		}
		return false;
	}

	private ResultActions list() throws Exception {
		return mvc.perform(get("/api/v1/me/timeline").with(authUser(user))).andExpect(status().isOk());
	}
	private ResultActions data(String suffix) throws Exception {
		return mvc.perform(get("/api/v1/trips/{id}/" + suffix, trip).with(authUser(user))).andExpect(status().isOk());
	}
	private void denied(UUID viewer, UUID id, String suffix) throws Exception {
		mvc.perform(get("/api/v1/trips/{id}/" + suffix, id).with(authUser(viewer)))
				.andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("TRIP_NOT_FOUND"));
	}
	private JsonNode body(ResultActions result) throws Exception {
		return mapper.readTree(result.andReturn().getResponse().getContentAsString());
	}
	private String encoded(String raw) {
		return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(java.nio.charset.StandardCharsets.UTF_8));
	}
	private UUID user() {
		UUID id = UUID.randomUUID();
		jdbc.update("insert into users(id,nickname,profile_completed,created_at,updated_at) values(?,'timeline',true,now(),now())", id);
		return id;
	}
	private UUID trip(String start, String end) {
		UUID id = UUID.randomUUID();
		jdbc.update("insert into trips(id,owner_user_id,title,start_date,end_date,created_at,updated_at) values(?,?,'timeline',?,?,now(),now())",
				id, user, start == null ? null : LocalDate.parse(start), end == null ? null : LocalDate.parse(end));
		jdbc.update("insert into trip_members(id,trip_id,user_id,join_order,joined_at) values(?,?,?,1,now())", UUID.randomUUID(), id, user);
		return id;
	}
	private UUID member(UUID userId, String state, int order) {
		UUID id = UUID.randomUUID();
		jdbc.update("insert into trip_members(id,trip_id,user_id,status,join_order,joined_at,left_at) values(?,?,?,?,?,now(),now())", id, trip, userId, state, order);
		return id;
	}
	private UUID place(UUID region) {
		UUID id = UUID.randomUUID();
		jdbc.update("insert into places(id,region_id,name,latitude,longitude,source,created_at,updated_at) values(?,?,'장소',37,127,'MANUAL',now(),now())", id, region);
		return id;
	}
	private UUID item(UUID place, int day, int sequence, String time) {
		UUID id = UUID.randomUUID();
		jdbc.update("insert into itinerary_items(id,itinerary_id,place_id,day,sequence,start_time) values(?,?,?,?,?,?)", id, itinerary, place, day, sequence, time);
		return id;
	}
	private UUID leg(UUID from, UUID to, Integer distance) {
		UUID id = UUID.randomUUID();
		jdbc.update("insert into route_legs(id,itinerary_id,from_item_id,to_item_id,transport_mode,duration_seconds,distance_meters,status,queried_at) values(?,?,?,?,'WALK',?,?,?,now())",
				id, itinerary, from, to, distance == null ? null : 30, distance, distance == null ? "UNAVAILABLE" : "AVAILABLE");
		return id;
	}
	private void visit(UUID place, UUID who, String at, boolean deleted) {
		jdbc.update("insert into visits(id,trip_id,member_id,place_id,visited_at,created_at,deleted_at) values(?,?,?,?,?::timestamptz,now(),?::timestamptz)",
				UUID.randomUUID(), trip, who, place, at, deleted ? at : null);
	}
	private void photo(UUID place, UUID who, boolean deleted, boolean assetDeleted) {
		UUID batch = UUID.randomUUID(), asset = UUID.randomUUID();
		jdbc.update("insert into photo_upload_batches(id,trip_id,created_by_member_id,file_count,created_at,expires_at) values(?,?,?,1,now(),now()+interval '1 hour')", batch, trip, who);
		jdbc.update("insert into assets(id,owner_user_id,trip_id,purpose,object_key,content_type,byte_size,status,created_at,deleted_at) values(?,?,?,'TRIP_PHOTO',?,'image/jpeg',1,?,now(),?::timestamptz)",
				asset, user, trip, asset.toString(), assetDeleted ? "DELETED" : "READY", assetDeleted ? "2026-11-10T00:00:00Z" : null);
		jdbc.update("insert into photos(id,batch_id,trip_id,uploader_member_id,asset_id,place_id,created_at,deleted_at) values(?,?,?,?,?,?,now(),?::timestamptz)",
				UUID.randomUUID(), batch, trip, who, asset, place, deleted ? "2026-11-10T00:00:00Z" : null);
	}
	private void expense(UUID who, long amount, boolean deleted) {
		jdbc.update("insert into expenses(id,trip_id,registered_by_member_id,payer_member_id,title,amount_minor,spent_at,created_at,updated_at,deleted_at) values(?,?,?,?,'경비',?,now(),now(),now(),?::timestamptz)",
				UUID.randomUUID(), trip, who, who, amount, deleted ? "2026-11-10T00:00:00Z" : null);
	}
}
