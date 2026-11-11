package com.eodilog.place.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.eodilog.TestcontainersConfiguration;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

/**
 * 단계별 조회의 경로(가까운 곳 훑기·반경 조회·나머지 한 번에)가 모두 같은 순서를 내는지 본다.
 * 테스트 자료가 적어 기본 설정은 항상 훑기로 끝나므로, 훑는 수와 밀집 기준을 줄여 다른 경로를 타게 한다.
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class PlaceSearchReaderTest {
	private static final double LAT = 35.1151, LNG = 129.0423; // 부산

	@Autowired NamedParameterJdbcTemplate named;
	@Autowired JdbcTemplate jdbc;
	@Autowired org.springframework.transaction.PlatformTransactionManager transactions;

	String q;
	List<UUID> nearOrder, plainOrder;

	// 긴 검색어는 trigram 인덱스를 쓰고, 짧은 검색어(한글 두 글자)는 인덱스를 피해 id 순 나눠 읽기를 탄다.
	// 짧은 검색어는 다른 테스트 자료와 겹치지 않게 아무 한글 두 글자를 고른다
	void seed(boolean shortQuery) {
		var random = new Random();
		q = shortQuery ? new String(new char[] { (char) (0xAC00 + random.nextInt(11172)), (char) (0xAC00 + random.nextInt(11172)) })
				: "zq" + Long.toString(System.nanoTime(), 36) + "카페";
		assertThat(PlaceSearchReader.nameMatch(q).contains("COLLATE")).isEqualTo(shortQuery);
		UUID exactFar = place(q, 37.5547, 126.9707);                  // 완전 일치, 서울(반경 밖)
		UUID exactMid = place(q, 35.8714, 128.6014);                  // 완전 일치, 대구(반경 밖, 서울보다 가깝다)
		UUID exactNear = place(q, 35.1160, 129.0430);                 // 완전 일치, 부산
		UUID exactNear2 = place(q, 35.2051, 129.0423);                // 완전 일치, 10km(1km 앞부분보다 앞)
		UUID in1 = place(q + " a", 35.1240, 129.0423);                // 1km, 앞부분
		UUID in2 = place("x " + q, 35.1601, 129.0423);                // 5km, 포함
		UUID in3 = place(q + " b", 35.2951, 129.0423);                // 20km, 앞부분
		UUID out1 = place("서울 " + q + "집", 37.5000, 127.0000);       // 반경 밖, 포함
		UUID out2 = place("대전 " + q, 36.3504, 127.3845);             // 반경 밖, 포함
		nearOrder = concat(List.of(exactNear, exactNear2, in1, in2, in3, exactMid, exactFar), byId(out1, out2));
		plainOrder = concat(byId(exactNear, exactNear2, exactMid, exactFar), List.of(in1, in3));
		plainOrder = concat(plainOrder, byId(in2, out1, out2));
	}

	@ParameterizedTest
	@ValueSource(booleans = { false, true })
	void everyNearPathGivesTheSameOrderAndPagesThroughIt(boolean shortQuery) {
		seed(shortQuery);
		var search = new PlaceSearchReader.Search(q, LAT, LNG, null);
		Map<String, PlaceSearchReader> readers = Map.of(
				"훑기로 끝남", new PlaceSearchReader(named),
				"훑기 후 반경 조회", new PlaceSearchReader(named, 3, Long.MAX_VALUE, 20_000),
				"훑기 후 나머지 한 번에", new PlaceSearchReader(named, 3, 0, 20_000),
				"한 곳만 훑고 반경 조회", new PlaceSearchReader(named, 1, Long.MAX_VALUE, 20_000),
				"한 곳만 훑고 나머지 한 번에", new PlaceSearchReader(named, 1, 0, 20_000),
				"반경 밖을 한 곳만 id 순으로 읽고 전체 읽기", new PlaceSearchReader(named, 3, Long.MAX_VALUE, 1),
				"반경 밖을 두 곳만 id 순으로 읽고 전체 읽기", new PlaceSearchReader(named, 3, Long.MAX_VALUE, 2));
		readers.forEach((label, reader) -> {
			assertThat(ids(reader.read(search, null, 100))).as(label).containsExactlyElementsOf(nearOrder);
			for (int size : List.of(1, 2, 3, 4)) assertThat(walk(reader, search, size)).as(label + " " + size).containsExactlyElementsOf(nearOrder);
		});
	}

	@ParameterizedTest
	@ValueSource(booleans = { false, true })
	void plainOrderPagesThroughExactPrefixAndContains(boolean shortQuery) {
		seed(shortQuery);
		var search = new PlaceSearchReader.Search(q, null, null, null);
		for (int budget : List.of(20_000, 1, 2)) {
			var reader = new PlaceSearchReader(named, 5_000, 100_000, budget);
			assertThat(ids(reader.read(search, null, 100))).as("budget " + budget).containsExactlyElementsOf(plainOrder);
			for (int size : List.of(1, 2, 3)) assertThat(walk(reader, search, size)).as("budget " + budget + " size " + size)
					.containsExactlyElementsOf(plainOrder);
		}
	}

	@ParameterizedTest
	@ValueSource(booleans = { false, true })
	void regionFilterAppliesToEveryTier(boolean shortQuery) {
		seed(shortQuery);
		UUID region = jdbc.queryForObject("SELECT id FROM regions ORDER BY code LIMIT 1", UUID.class);
		UUID inRegion = place(q + " 지역", 35.1300, 129.0423);
		jdbc.update("UPDATE places SET region_id=? WHERE id=?", region, inRegion);
		for (var reader : List.of(new PlaceSearchReader(named), new PlaceSearchReader(named, 1, 0, 1),
				new PlaceSearchReader(named, 1, Long.MAX_VALUE, 1))) {
			assertThat(ids(reader.read(new PlaceSearchReader.Search(q, LAT, LNG, region), null, 100))).containsExactly(inRegion);
			assertThat(ids(reader.read(new PlaceSearchReader.Search(q, null, null, region), null, 100))).containsExactly(inRegion);
		}
	}

	@Test
	void searchTransactionPlansEveryQueryWithItsOwnValues() {
		seed(false);
		var tx = new org.springframework.transaction.support.TransactionTemplate(transactions);
		String mode = tx.execute(status -> {
			new PlaceSearchReader(named).read(new PlaceSearchReader.Search(q, null, null, null), null, 1);
			return jdbc.queryForObject("SHOW plan_cache_mode", String.class);
		});
		assertThat(mode).isEqualTo("force_custom_plan");
		// 트랜잭션이 끝나면 원래 값으로 돌아간다(SET LOCAL)
		String after = tx.execute(status -> jdbc.queryForObject("SHOW plan_cache_mode", String.class));
		assertThat(after).isEqualTo("auto");
	}

	@Test
	void shortQueriesAvoidTrigramIndex() {
		var trigram = PlaceSearchReader.nameMatch("서울역");
		assertThat(PlaceSearchReader.nameMatch("카페")).isNotEqualTo(trigram);
		assertThat(PlaceSearchReader.nameMatch("a b c")).isNotEqualTo(trigram);
		assertThat(PlaceSearchReader.nameMatch("ab-1")).isNotEqualTo(trigram);
		assertThat(PlaceSearchReader.nameMatch("cu 강남점")).isEqualTo(trigram);
		assertThat(PlaceSearchReader.nameMatch("gs25")).isEqualTo(trigram);
	}

	@Test
	void prefixUpperBoundIsNextCodePoint() {
		assertThat(PlaceSearchReader.upper("abc")).isEqualTo("abd");
		assertThat(PlaceSearchReader.upper("카페")).isEqualTo("카펙");
		assertThat(PlaceSearchReader.upper("a퟿")).isEqualTo("a");
		assertThat(PlaceSearchReader.upper("a" + new String(Character.toChars(Character.MAX_CODE_POINT)))).isNull();
	}

	// 커서처럼 마지막 줄 위치를 넘겨 size곳씩 읽는다
	private List<UUID> walk(PlaceSearchReader reader, PlaceSearchReader.Search search, int size) {
		List<UUID> seen = new ArrayList<>();
		PlaceSearchCursor after = null;
		for (int i = 0; i < 20; i++) {
			var hits = reader.read(search, after, size + 1);
			var page = hits.subList(0, Math.min(size, hits.size()));
			seen.addAll(ids(page));
			if (hits.size() <= size) break;
			var last = page.getLast();
			after = new PlaceSearchCursor("t", last.tier(), search.near() ? last.distance() : null,
					search.near() ? null : last.nameKey(), last.place().id());
		}
		return seen;
	}

	private static List<UUID> ids(List<PlaceSearchReader.Hit> hits) {
		return hits.stream().map(h -> h.place().id()).toList();
	}

	private static List<UUID> byId(UUID... ids) {
		return Arrays.stream(ids).sorted(Comparator.comparing(UUID::toString)).toList(); // PostgreSQL uuid 순서
	}

	private static List<UUID> concat(List<UUID> head, List<UUID> tail) {
		List<UUID> all = new ArrayList<>(head);
		all.addAll(tail);
		return all;
	}

	private UUID place(String name, double latitude, double longitude) {
		UUID id = UUID.randomUUID();
		jdbc.update("INSERT INTO places(id,name,latitude,longitude,source,created_at,updated_at) VALUES(?,?,?,?,'MANUAL',now(),now())",
				id, name, latitude, longitude);
		return id;
	}
}
