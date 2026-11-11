package com.eodilog.place.controller;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
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

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class PlaceSearchApiTest {
	private static final String BUSAN = "35.1151,129.0423";

	@Autowired MockMvc mvc;
	@Autowired JdbcTemplate jdbc;
	private final JsonMapper json = JsonMapper.builder().build();

	UUID me;
	String query;
	UUID exactSeoul, shortPrefix, longPrefix, containsBusan, containsHaeundae;

	@BeforeEach
	void setUp() {
		me = UUID.randomUUID();
		jdbc.update("INSERT INTO users(id,nickname,profile_completed,created_at,updated_at) VALUES(?,'검색자',true,now(),now())", me);
		// 다른 테스트 자료와 섞이지 않도록 검색어마다 고유한 글자를 붙인다. 대문자로 넣어 대소문자 무시를 함께 본다
		String tag = "Zq" + Long.toString(System.nanoTime(), 36).toUpperCase(Locale.ROOT);
		query = tag + "서울역";
		exactSeoul = place(" " + query + " ", 37.5547, 126.9707);   // 이름 완전 일치(앞뒤 공백), 부산에서 멀다
		shortPrefix = place(query + "점", 36.3504, 127.3845);       // 앞부분 일치, 대전
		longPrefix = place(query + " 김밥", 37.4563, 126.7052);     // 앞부분 일치, 인천
		containsBusan = place("부산 " + query + " 맛집", 35.1150, 129.0420); // 포함, 부산 바로 옆
		containsHaeundae = place("해운대 " + query, 35.1631, 129.1635);    // 포함, 부산에서 12km
	}

	// near(부산): 30km 안 완전 일치(없음) → 30km 안 나머지 가까운 순 → 30km 밖 완전 일치 → 30km 밖 나머지 id 순
	private List<UUID> nearOrder() {
		return concat(List.of(containsBusan, containsHaeundae, exactSeoul), byId(shortPrefix, longPrefix));
	}

	// near 없음: 완전 일치 → 앞부분 일치 이름순(C 정렬이라 공백이 '점'보다 앞) → 그 밖의 포함 id 순
	private List<UUID> plainOrder() {
		return concat(List.of(exactSeoul, longPrefix, shortPrefix), byId(containsBusan, containsHaeundae));
	}

	@Test
	void nearPutsFarExactNameAfterEverythingInsideRadius() throws Exception {
		assertThat(ids(search(query.toLowerCase(Locale.ROOT)).param("near", BUSAN).param("limit", "20")))
				.containsExactlyElementsOf(nearOrder());
		// 30km 안의 완전 일치는 더 가까운 포함보다 앞이다. 쉼표 앞뒤 공백도 받는다
		assertThat(ids(search(query).param("near", "37.5600 , 126.9750"))).first().isEqualTo(exactSeoul);
	}

	@Test
	void withoutNearRanksExactThenPrefixByNameThenContains() throws Exception {
		assertThat(ids(search("  " + query + " "))).containsExactlyElementsOf(plainOrder());
	}

	@Test
	void cursorWalksSameOrderOnePageAtATime() throws Exception {
		assertThat(walk(Map.of("near", BUSAN))).containsExactlyElementsOf(nearOrder());
		assertThat(walk(Map.of())).containsExactlyElementsOf(plainOrder());
	}

	@Test
	void rejectsBadNearAndCursorFromOtherConditions() throws Exception {
		for (String near : List.of("abc", "37.5", "91,127", "37.5,181", "37.5,127,1", "NaN,127"))
			mvc.perform(search(query).param("near", near)).andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
					.andExpect(jsonPath("$.error.fields[0].field").value("near"));

		String nearCursor = page(search(query).param("near", BUSAN).param("limit", "1")).at("/page/nextCursor").asText();
		String plainCursor = page(search(query).param("limit", "1")).at("/page/nextCursor").asText();
		List<MockHttpServletRequestBuilder> wrong = List.of(
				search(query).param("cursor", nearCursor),                                  // near를 뺐다
				search(query).param("near", "37.5,127").param("cursor", nearCursor),         // near가 다르다
				search(query + "점").param("near", BUSAN).param("cursor", nearCursor),      // 검색어가 다르다
				search(query).param("near", BUSAN).param("cursor", plainCursor),             // 다른 정렬의 커서
				search(query).param("regionId", UUID.randomUUID().toString()).param("cursor", plainCursor),
				search(query).param("cursor", UUID.randomUUID().toString()),                 // 예전 UUID 커서
				search(query).param("cursor", "!!"));
		for (var request : wrong)
			mvc.perform(request).andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.error.fields[0].field").value("cursor"));
	}

	@Test
	void documentsNearAndStringCursor() throws Exception {
		JsonNode params = json.readTree(mvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
				.andReturn().getResponse().getContentAsString()).at("/paths/~1api~1v1~1places/get/parameters");
		Map<String, JsonNode> byName = new HashMap<>();
		params.forEach(p -> byName.put(p.get("name").asString(), p));
		assertThat(byName.get("near").get("description").asString()).contains("위도,경도");
		assertThat(byName.get("cursor").at("/schema/type").asString()).isEqualTo("string");
		assertThat(byName.get("cursor").at("/schema/format").isMissingNode()).isTrue();
	}

	private List<UUID> walk(Map<String, String> extra) throws Exception {
		List<UUID> seen = new ArrayList<>();
		String cursor = null;
		do {
			var request = search(query).param("limit", "1");
			extra.forEach(request::param);
			if (cursor != null) request.param("cursor", cursor);
			JsonNode body = page(request);
			body.get("data").forEach(p -> seen.add(UUID.fromString(p.get("id").asText())));
			cursor = body.at("/page/hasNext").asBoolean() ? body.at("/page/nextCursor").asText() : null;
		} while (cursor != null && seen.size() < 10);
		return seen;
	}

	private static List<UUID> byId(UUID... ids) {
		return Arrays.stream(ids).sorted(Comparator.comparing(UUID::toString)).toList(); // PostgreSQL uuid 순서
	}

	private static List<UUID> concat(List<UUID> head, List<UUID> tail) {
		List<UUID> all = new ArrayList<>(head);
		all.addAll(tail);
		return all;
	}

	private MockHttpServletRequestBuilder search(String q) {
		return get("/api/v1/places").with(authUser(me)).param("query", q);
	}

	private JsonNode page(MockHttpServletRequestBuilder request) throws Exception {
		return json.readTree(mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
	}

	private List<UUID> ids(MockHttpServletRequestBuilder request) throws Exception {
		List<UUID> ids = new ArrayList<>();
		page(request).get("data").forEach(p -> ids.add(UUID.fromString(p.get("id").asText())));
		return ids;
	}

	private UUID place(String name, double latitude, double longitude) {
		UUID id = UUID.randomUUID();
		jdbc.update("INSERT INTO places(id,name,latitude,longitude,source,created_at,updated_at) VALUES(?,?,?,?,'MANUAL',now(),now())",
				id, name, latitude, longitude);
		return id;
	}
}
