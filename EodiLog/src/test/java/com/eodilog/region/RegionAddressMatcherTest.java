package com.eodilog.region;

import static org.assertj.core.api.Assertions.assertThat;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.region.service.RegionAddressMatcher;
import java.util.UUID;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.postgresql.PostgreSQLContainer;

// 주소 → 지역 코드(EODI-246). 장소 추출 장소와 기존 장소 일괄 채우기가 같은 DB 함수를 쓴다
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class RegionAddressMatcherTest {

	@Autowired
	private RegionAddressMatcher matcher;

	@Autowired
	private DataSource dataSource;

	@Autowired
	private PostgreSQLContainer postgres;

	@ParameterizedTest
	@CsvSource(delimiter = '|', value = {
			// 공공 장소·네이버 도로명 주소의 기본 모양
			"부산광역시 해운대구 해운대해변로 264|2635000000",
			"서울특별시 중구 세종대로 110|1114000000",
			// 일반구가 있는 시는 시 단위 지역으로 묶는다
			"경기도 수원시 장안구 정조로 944|4111000000",
			// 시·군·구가 없는 세종은 시·도 이름으로 맞춘다
			"세종특별자치시 한누리대로 2130|3611000000",
			// 시·도 줄임말
			"부산 수영구 광안해변로 219|2650000000",
			"경남 창원시 의창구 중앙대로 151|4812000000",
			// 옛 시·도 이름
			"강원도 춘천시 중앙로 1|5111000000",
			"전라북도 전주시 완산구 효자로 225|5211000000",
			"광주광역시 동구 문화전당로 38|1221000000",
			"전라남도 목포시 양을산로 1|1211000000",
			// 관할·이름이 바뀐 시·군·구
			"경상북도 군위군 군위읍 군청로 1|2772000000",
			"인천광역시 남구 독정이로 95|2817700000",
			// 앞뒤·사이 공백(따옴표가 없으면 CsvSource가 앞뒤 공백을 지운다)
			"'  대구광역시   중구  공평로 88 '|2711000000",
			"'\t부산광역시\t해운대구 해운대해변로 264'|2635000000",
	})
	void findsRegionCodeFromAddressPrefix(String address, String expectedCode) {
		assertThat(matcher.regionCode(address)).isEqualTo(expectedCode);
	}

	@ParameterizedTest
	@CsvSource(delimiter = '|', value = {
			// 시·군·구를 모르면 하위 지역이 있는 시·도로 넓혀 맞추지 않는다
			"부산광역시 없는구 어딘가로 1",
			"경기도",
			// 지명이 아닌 주소
			"Seoul Jung-gu",
			"어딘가",
	})
	void leavesUnknownAddressesWithoutRegion(String address) {
		assertThat(matcher.regionCode(address)).isNull();
	}

	@Test
	void leavesBlankAddressWithoutRegion() {
		assertThat(matcher.regionCode(null)).isNull();
		assertThat(matcher.regionCode("   ")).isNull();
	}

	// 1300까지 올린 별도 스키마에 지역 없는 장소를 넣고 1801까지 올려, 네이버 장소만 채워지는지 본다
	@Test
	void migrationFillsOnlyNaverPlacesWithoutRegion() {
		String schema = "region_fill_" + UUID.randomUUID().toString().replace("-", "");
		JdbcTemplate shared = new JdbcTemplate(dataSource);
		shared.execute("create schema " + schema);
		try {
			String url = postgres.getJdbcUrl() + (postgres.getJdbcUrl().contains("?") ? "&" : "?")
					+ "currentSchema=" + schema + ",public";
			DriverManagerDataSource isolated = new DriverManagerDataSource(url, postgres.getUsername(), postgres.getPassword());
			Flyway.configure().dataSource(isolated).schemas(schema).defaultSchema(schema)
					.locations("classpath:db/migration").target("202611091300").load().migrate();
			JdbcTemplate jdbc = new JdbcTemplate(isolated);

			UUID busan = insertPlace(jdbc, "NAVER", "n1", "부산 수영구 광안해변로 219", null);
			UUID unknown = insertPlace(jdbc, "NAVER", "n2", "어딘가 모르는 곳", null);
			UUID noAddress = insertPlace(jdbc, "NAVER", "n3", null, null);
			UUID haeundae = regionId(jdbc, "2635000000");
			// 이미 지역이 있는 장소는 주소와 달라도 바꾸지 않는다
			UUID kept = insertPlace(jdbc, "NAVER", "n4", "서울특별시 중구 세종대로 110", haeundae);
			// 다른 공급자·수동 장소는 대상이 아니다
			UUID kto = insertPlace(jdbc, "KTO", "k1", "서울특별시 중구 세종대로 110", null);
			UUID manual = insertPlace(jdbc, null, null, "서울특별시 중구 세종대로 110", null);

			Flyway upgraded = Flyway.configure().dataSource(isolated).schemas(schema).defaultSchema(schema)
					.locations("classpath:db/migration").target("202611091801").load();
			assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(2);
			upgraded.validate();

			assertThat(placeRegion(jdbc, busan)).isEqualTo(regionId(jdbc, "2650000000"));
			assertThat(placeRegion(jdbc, unknown)).isNull();
			assertThat(placeRegion(jdbc, noAddress)).isNull();
			assertThat(placeRegion(jdbc, kept)).isEqualTo(haeundae);
			assertThat(placeRegion(jdbc, kto)).isNull();
			assertThat(placeRegion(jdbc, manual)).isNull();
		} finally {
			shared.execute("drop schema " + schema + " cascade");
		}
	}

	private static UUID insertPlace(JdbcTemplate jdbc, String provider, String providerPlaceId, String address,
			UUID regionId) {
		UUID id = UUID.randomUUID();
		jdbc.update("insert into places(id,region_id,name,address,latitude,longitude,provider,provider_place_id,source,"
				+ "created_at,updated_at) values(?,?,'장소',?,35.15,129.11,?,?,?,now(),now())",
				id, regionId, address, provider, providerPlaceId, provider == null ? "MANUAL" : "PROVIDER");
		return id;
	}

	private static UUID regionId(JdbcTemplate jdbc, String code) {
		return jdbc.queryForObject("select id from regions where code = ?", UUID.class, code);
	}

	private static UUID placeRegion(JdbcTemplate jdbc, UUID placeId) {
		return jdbc.queryForObject("select region_id from places where id = ?", UUID.class, placeId);
	}

}
