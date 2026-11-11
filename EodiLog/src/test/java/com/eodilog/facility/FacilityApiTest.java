package com.eodilog.facility;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** 주변 편의시설(S28, EODI-304). 다른 테스트 자료와 섞이지 않게 반경 6km 안에 아무 시설도 없는 좌표를 고른다 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class FacilityApiTest {
	// 위도 0.001도 ≈ 111m
	private static final double STEP = 0.001;

	@Autowired MockMvc mvc;
	@Autowired JdbcTemplate jdbc;
	private final JsonMapper json = JsonMapper.builder().build();

	UUID me, base;
	double lat, lng;

	@BeforeEach
	void setUp() {
		me = UUID.randomUUID();
		jdbc.update("INSERT INTO users(id,nickname,profile_completed,created_at,updated_at) VALUES(?,'시설',true,now(),now())", me);
		var random = new Random();
		for (int i = 0; ; i++) {
			lat = 34.6 + random.nextDouble() * 3.0;
			lng = 126.7 + random.nextDouble() * 2.5;
			if (empty()) break;
			if (i > 50) throw new IllegalStateException("no empty spot");
		}
		base = place("기준약국", null, 0); // 기준 장소가 약국이어도 자기 자신은 빼고 준다
	}

	@Test
	void pharmaciesComeFromCategoryOrNameNearestFirstAndPageByCursor() throws Exception {
		UUID byCategory = place("건강한집", "보건의료>의약·의료용품 소매>약국", 3);    // 약 330m
		UUID byName = place("온누리약국", null, 6);                                  // 약 670m
		place("약국 옆 카페", "음식>비알코올>카페", 2);                                // 이름에 약국이 있지만 약국이 아니다
		UUID far = place("먼약국", null, 30);                                         // 약 3.3km
		assertThat(ids("PHARMACY", "2000")).containsExactly(byCategory.toString(), byName.toString());
		assertThat(walk("PHARMACY", "5000")).containsExactly(byCategory.toString(), byName.toString(), far.toString());

		JsonNode first = page(request("PHARMACY", "2000"));
		assertThat(first.at("/data/0/type").asString()).isEqualTo("PHARMACY");
		assertThat(first.at("/data/0/availability").isNull()).isTrue();
		// 약 330m × 1.3 ÷ 1.25m/s ≈ 347초
		assertThat(first.at("/data/0/walkingSeconds").asInt()).isBetween(320, 370);
	}

	@Test
	void convenienceStoresAndGasStationsMatchBrandOrCategory() throws Exception {
		UUID cu = place("CU 서면중앙점", null, 1);
		UUID category = place("행복마트24", "소매>종합 소매>편의점", 2);
		place("CUBE 카페", "음식>비알코올>카페", 3);
		UUID sk = place("SK 행복주유소", null, 4);
		UUID energy = place("에너지플러스", "소매>연료 소매>주유소", 5);
		assertThat(ids("CONVENIENCE_STORE", "2000")).containsExactly(cu.toString(), category.toString());
		assertThat(ids("GAS_STATION", "2000")).containsExactly(sk.toString(), energy.toString());
	}

	@Test
	void evChargersShowConfirmedAvailabilityOnly() throws Exception {
		String free = station("빈 충전소", 2, new String[][] { { "01", "04", "50", "2" }, { "02", "02", "7", "2" }, { "03", "04", "100", "3" } });
		String busy = station("붐비는 충전소", 4, new String[][] { { "01", "04", "50", "3" } });
		String unknown = station("모르는 충전소", 5, new String[][] { { "01", "04", "50", "9" } });
		station("먼 충전소", 30, new String[][] { { "01", "04", "50", "2" } });

		jdbc.update("UPDATE ev_sync_state SET full_completed_at = NULL, status_synced_at = NULL, status_valid = false WHERE id = 1");
		mvc.perform(request("EV_CHARGER", "2000")).andExpect(status().isServiceUnavailable())
				.andExpect(jsonPath("$.error.code").value("FACILITY_UNAVAILABLE"));

		jdbc.update("UPDATE ev_sync_state SET full_completed_at = now(), status_synced_at = now(), status_valid = true WHERE id = 1");
		JsonNode body = page(request("EV_CHARGER", "2000"));
		assertThat(ids(body)).containsExactly(free, busy, unknown);
		assertThat(body.at("/data/0/availability").asString()).isEqualTo("급속 1대·완속 1대 사용 가능");
		assertThat(body.at("/data/1/availability").asString()).isEqualTo("모두 충전 중");
		assertThat(body.at("/data/2/availability").isNull()).isTrue();
		assertThat(body.at("/data/0/queriedAt").asString()).isNotBlank();

		// 갱신이 20분 넘게 멈췄거나 빈틈을 메우지 못했으면 위치만 보여 준다
		jdbc.update("UPDATE ev_sync_state SET status_synced_at = now() - interval '30 minutes' WHERE id = 1");
		assertThat(page(request("EV_CHARGER", "2000")).at("/data/0/availability").isNull()).isTrue();
		jdbc.update("UPDATE ev_sync_state SET status_synced_at = now(), status_valid = false WHERE id = 1");
		JsonNode invalid = page(request("EV_CHARGER", "2000"));
		assertThat(ids(invalid)).containsExactly(free, busy, unknown);
		assertThat(invalid.at("/data/0/availability").isNull()).isTrue();
	}

	@Test
	void toiletsNeedImportedData() throws Exception {
		jdbc.update("DELETE FROM public_toilets");
		mvc.perform(request("TOILET", "2000")).andExpect(status().isServiceUnavailable())
				.andExpect(jsonPath("$.error.code").value("FACILITY_UNAVAILABLE"));
		String near = toilet("공원 화장실", 2);
		String next = toilet("역 화장실", 7);
		toilet("먼 화장실", 40);
		assertThat(ids("TOILET", "2000")).containsExactly(near, next);
	}

	@Test
	void emptyResultIsAnEmptyList() throws Exception {
		mvc.perform(request("PHARMACY", "2000")).andExpect(status().isOk()).andExpect(jsonPath("$.data").isEmpty())
				.andExpect(jsonPath("$.page.hasNext").value(false));
	}

	@Test
	void rejectsBadInput() throws Exception {
		mvc.perform(request("ATM", "2000")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.fields[0].field").value("type"));
		mvc.perform(request("PHARMACY", "100")).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("radiusMeters"));
		mvc.perform(request("PHARMACY", "6000")).andExpect(status().isBadRequest());
		mvc.perform(get("/api/v1/places/" + base + "/facilities").with(authUser(me))).andExpect(status().isBadRequest());
		mvc.perform(get("/api/v1/places/" + UUID.randomUUID() + "/facilities").with(authUser(me)).param("type", "PHARMACY"))
				.andExpect(status().isNotFound());
		place("가약국", null, 1);
		place("나약국", null, 2);
		String cursor = page(request("PHARMACY", "2000").param("limit", "1")).at("/page/nextCursor").asString();
		// 다른 종류·반경의 커서는 받지 않는다
		mvc.perform(request("CONVENIENCE_STORE", "2000").param("cursor", cursor)).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.fields[0].field").value("cursor"));
		mvc.perform(request("PHARMACY", "3000").param("cursor", cursor)).andExpect(status().isBadRequest());
		mvc.perform(request("PHARMACY", "2000").param("cursor", "%%%")).andExpect(status().isBadRequest());
	}

	@Test
	void documentsTheEndpoint() throws Exception {
		JsonNode docs = json.readTree(mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn().getResponse()
				.getContentAsString());
		JsonNode operation = docs.at("/paths/~1api~1v1~1places~1{placeId}~1facilities/get");
		assertThat(operation.get("summary").asString()).isEqualTo("주변 편의시설");
		List<String> names = new ArrayList<>();
		operation.get("parameters").forEach(p -> names.add(p.get("name").asString()));
		assertThat(names).contains("placeId", "type", "radiusMeters", "cursor", "limit");
		assertThat(operation.at("/responses/503/description").asString()).contains("FACILITY_UNAVAILABLE");
	}

	private List<String> walk(String type, String radius) throws Exception {
		List<String> seen = new ArrayList<>();
		String cursor = null;
		do {
			var request = request(type, radius).param("limit", "1");
			if (cursor != null) request.param("cursor", cursor);
			JsonNode body = page(request);
			seen.addAll(ids(body));
			cursor = body.at("/page/hasNext").asBoolean() ? body.at("/page/nextCursor").asString() : null;
		} while (cursor != null && seen.size() < 10);
		return seen;
	}

	private MockHttpServletRequestBuilder request(String type, String radius) {
		return get("/api/v1/places/" + base + "/facilities").with(authUser(me)).param("type", type).param("radiusMeters", radius);
	}

	private JsonNode page(MockHttpServletRequestBuilder request) throws Exception {
		return json.readTree(mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
	}

	private List<String> ids(String type, String radius) throws Exception {
		return ids(page(request(type, radius)));
	}

	private static List<String> ids(JsonNode body) {
		List<String> ids = new ArrayList<>();
		body.get("data").forEach(f -> ids.add(f.get("providerId").asString()));
		return ids;
	}

	private boolean empty() {
		String near = "ST_DWithin(ST_SetSRID(ST_MakePoint(%s), 4326)::geography, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, 6000)";
		return Boolean.TRUE.equals(jdbc.queryForObject("SELECT NOT EXISTS (SELECT 1 FROM places WHERE "
				+ near.formatted("longitude::float8, latitude::float8") + ") AND NOT EXISTS (SELECT 1 FROM ev_stations WHERE "
				+ near.formatted("longitude, latitude") + ") AND NOT EXISTS (SELECT 1 FROM public_toilets WHERE "
				+ near.formatted("longitude, latitude") + ")", Boolean.class, lng, lat, lng, lat, lng, lat));
	}

	// 기준점에서 북쪽으로 steps × 약 111m
	private UUID place(String name, String category, int steps) {
		UUID id = UUID.randomUUID();
		jdbc.update("INSERT INTO places(id,name,category,latitude,longitude,source,created_at,updated_at) VALUES(?,?,?,?,?,'MANUAL',now(),now())",
				id, name, category, lat + steps * STEP, lng);
		return id;
	}

	private String station(String name, int steps, String[][] chargers) {
		String id = "T" + Long.toString(System.nanoTime(), 36).toUpperCase(Locale.ROOT);
		jdbc.update("INSERT INTO ev_stations(id,name,latitude,longitude,seen_at) VALUES(?,?,?,?,now())", id, name, lat + steps * STEP, lng);
		for (String[] c : chargers) {
			jdbc.update("INSERT INTO ev_chargers(station_id,charger_id,charger_type,output_kw,status,status_updated_at,seen_at)"
					+ " VALUES(?,?,?,?,?,now(),now())", id, c[0], c[1], Integer.valueOf(c[2]), c[3]);
		}
		return id;
	}

	private String toilet(String name, int steps) {
		UUID id = UUID.randomUUID();
		jdbc.update("INSERT INTO public_toilets(id,name,latitude,longitude,updated_at) VALUES(?,?,?,?,now())", id, name, lat + steps * STEP, lng);
		return id.toString();
	}
}
