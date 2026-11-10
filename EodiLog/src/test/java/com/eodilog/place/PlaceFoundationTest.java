package com.eodilog.place;

import static org.assertj.core.api.Assertions.*;

import java.math.BigDecimal;
import java.util.*;
import java.util.concurrent.*;
import com.eodilog.TestcontainersConfiguration;
import com.eodilog.place.domain.PlaceSource;
import com.eodilog.place.dto.PlaceView;
import com.eodilog.place.provider.*;
import com.eodilog.place.service.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
class PlaceFoundationTest {

	@Autowired PlaceReader reader;
	@Autowired PlaceResolver resolver;
	@Autowired JdbcTemplate jdbc;

	UUID regionId;
	String regionCode;

	@BeforeEach
	void setUp() {
		regionId = UUID.randomUUID();
		regionCode = "TEST-" + regionId;
		jdbc.update("INSERT INTO regions(id,code,name) VALUES (?,?,'테스트시')", regionId, regionCode);
	}

	ProviderPlace place(String providerPlaceId, String name) {
		return new ProviderPlace(providerPlaceId, name, "제주 서귀포시", new BigDecimal("33.4580000"),
				new BigDecimal("126.9420000"), regionCode, "  여행,명소>해수욕장 ");
	}

	String newProviderId() {
		return UUID.randomUUID().toString();
	}

	@Test
	void resolveStoresProviderPlaceAndReaderReturnsSpecShape() {
		PlaceView saved = resolver.resolve("KAKAO", place(newProviderId(), "성산일출봉"));

		assertThat(saved.id().version()).isEqualTo(7);
		assertThat(saved.source()).isEqualTo(PlaceSource.PROVIDER);
		assertThat(saved.provider()).isEqualTo("KAKAO");
		assertThat(saved.regionId()).isEqualTo(regionId);
		assertThat(reader.find(saved.id())).contains(saved);
	}

	@Test
	void sameProviderIdUpdatesOneRowInsteadOfDuplicating() {
		String id = newProviderId();
		PlaceView first = resolver.resolve("KAKAO", place(id, "옛 이름"));
		PlaceView second = resolver.resolve("KAKAO", new ProviderPlace(id, "새 이름", null,
				new BigDecimal("33.0000000"), new BigDecimal("126.0000000"), "UNKNOWN-CODE", null));

		assertThat(second.id()).isEqualTo(first.id());
		assertThat(second.name()).isEqualTo("새 이름");
		assertThat(second.address()).isNull();
		assertThat(second.regionId()).as("모르는 지역 코드면 기존 지역 유지").isEqualTo(regionId);
		assertThat(jdbc.queryForObject("SELECT count(*) FROM places WHERE provider_place_id=?", Integer.class, id)).isOne();
		assertThat(jdbc.queryForObject("SELECT category FROM places WHERE id=?", String.class, first.id()))
				.as("분류를 다듬어 저장하고, 분류 없는 재조회는 기존 분류를 유지").isEqualTo("여행,명소>해수욕장");
	}

	@Test
	void unknownRegionCodeLeavesNewPlaceWithoutRegion() {
		PlaceView saved = resolver.resolve("KAKAO", new ProviderPlace(newProviderId(), "지역 모름", null,
				new BigDecimal("33.0000000"), new BigDecimal("126.0000000"), null, " "));
		assertThat(saved.regionId()).isNull();
		assertThat(jdbc.queryForObject("SELECT category FROM places WHERE id=?", String.class, saved.id())).isNull();
	}

	@Test
	void sameIdFromDifferentProvidersStaysSeparate() {
		String id = newProviderId();
		assertThat(resolver.resolve("KAKAO", place(id, "A")).id())
				.isNotEqualTo(resolver.resolve(FakePlaceProvider.NAME, place(id, "A")).id());
	}

	@Test
	void concurrentResolveOfSamePlaceCreatesSingleRow() throws Exception {
		String id = newProviderId();
		CountDownLatch start = new CountDownLatch(1);
		try (var pool = Executors.newFixedThreadPool(4)) {
			List<Future<PlaceView>> results = new ArrayList<>();
			for (int i = 0; i < 4; i++) {
				results.add(pool.submit(() -> { start.await(); return resolver.resolve("KAKAO", place(id, "동시")); }));
			}
			start.countDown();
			Set<UUID> ids = new HashSet<>();
			for (var result : results) ids.add(result.get(10, TimeUnit.SECONDS).id());
			assertThat(ids).hasSize(1);
		}
		assertThat(jdbc.queryForObject("SELECT count(*) FROM places WHERE provider_place_id=?", Integer.class, id)).isOne();
	}

	@Test
	void findAllSkipsMissingIdsAndEmptyInputReturnsEmpty() {
		PlaceView saved = resolver.resolve("KAKAO", place(newProviderId(), "있음"));
		UUID missing = UUID.randomUUID();

		assertThat(reader.findAll(List.of(saved.id(), missing, saved.id()))).containsOnlyKeys(saved.id());
		assertThat(reader.find(missing)).isEmpty();
		assertThat(reader.findAll(List.of())).isEmpty();
	}

	@Test
	void schemaRejectsInconsistentProviderColumns() {
		String insert = "INSERT INTO places(id,name,latitude,longitude,provider,provider_place_id,source,created_at,updated_at) VALUES (?,?,33,126,?,?,?,now(),now())";
		assertThatThrownBy(() -> jdbc.update(insert, UUID.randomUUID(), "수동", "KAKAO", "1", "MANUAL"))
				.isInstanceOf(DataIntegrityViolationException.class);
		assertThatThrownBy(() -> jdbc.update(insert, UUID.randomUUID(), "공급자", "KAKAO", null, "PROVIDER"))
				.isInstanceOf(DataIntegrityViolationException.class);
		assertThatThrownBy(() -> jdbc.update(insert, UUID.randomUUID(), " ", null, null, "MANUAL"))
				.isInstanceOf(DataIntegrityViolationException.class);

		UUID manual = UUID.randomUUID();
		jdbc.update(insert, manual, "직접 등록", null, null, "MANUAL");
		assertThat(reader.find(manual)).hasValueSatisfying(p -> {
			assertThat(p.source()).isEqualTo(PlaceSource.MANUAL);
			assertThat(p.provider()).isNull();
			assertThat(p.providerPlaceId()).isNull();
		});
	}

	@Test
	void fakeProviderPagesResultsAndResolvesToLocalPlaces() {
		var provider = new FakePlaceProvider(2);
		for (int i = 1; i <= 3; i++) provider.add(place(newProviderId(), "카페 " + i));

		ProviderPage first = provider.search(new ProviderSearch("카페", null, null, null, 1));
		ProviderPage second = provider.search(new ProviderSearch("카페", null, null, null, 2));
		assertThat(first.places()).hasSize(2);
		assertThat(first.last()).isFalse();
		assertThat(second.places()).hasSize(1);
		assertThat(second.last()).isTrue();
		assertThat(provider.search(new ProviderSearch("없는 장소", null, null, null, 1)).places()).isEmpty();

		PlaceView local = resolver.resolve(provider.name(), first.places().getFirst());
		assertThat(reader.find(local.id())).isPresent();

		provider.unavailable(true);
		assertThatThrownBy(() -> provider.search(new ProviderSearch("카페", null, null, null, 1)))
				.isInstanceOf(PlaceProviderUnavailableException.class);
	}
}
