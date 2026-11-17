package com.eodilog.global.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import java.util.stream.Collectors;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

// 운영 전용 데모 마이그레이션(db/demo)은 공유 테스트 DB에 넣지 않으려고 컨테이너를 따로 띄워 확인한다
class DemoSeedMigrationTest {

	private static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(
			DockerImageName.parse("postgis/postgis:17-3.5").asCompatibleSubstituteFor("postgres"));
	private static JdbcTemplate jdbc;

	@BeforeAll
	static void migrate() {
		POSTGRES.start();
		Flyway.configure()
				.dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
				.locations(prodFlywayLocations().split(","))
				.load()
				.migrate();
		jdbc = new JdbcTemplate(new DriverManagerDataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword()));
	}

	@AfterAll
	static void stop() {
		POSTGRES.stop();
	}

	private static String prodFlywayLocations() {
		var yaml = new YamlPropertiesFactoryBean();
		yaml.setResources(new ClassPathResource("application-prod.yaml"));
		return yaml.getObject().getProperty("spring.flyway.locations");
	}

	@Test
	void prodProfileReadsDemoLocation() {
		assertThat(prodFlywayLocations().split(",")).containsExactly("classpath:db/migration", "classpath:db/demo");
	}

	@Test
	void seedsTenPublicAccountsWithPersonNames() {
		var nicknames = jdbc.queryForList("""
				select nickname from users where id in (select md5('eodilog-demo-u'||g)::uuid from generate_series(1,10) g)
				 and status='ACTIVE' and profile_completed and account_visibility='PUBLIC' order by nickname""", String.class);
		assertThat(nicknames).containsExactlyInAnyOrder("김민준", "이서연", "박지훈", "최유나", "정재원",
				"강하은", "윤서진", "장도윤", "임채원", "신예준");
	}

	@Test
	void everyTripHasOnePublishedFeedWithRegions() {
		assertThat(jdbc.queryForObject("""
				select count(*) from trips t join trip_members m on m.trip_id=t.id and m.user_id=t.owner_user_id and m.status='ACTIVE'
				 join feeds f on f.trip_id=t.id and f.deleted_at is null
				where t.owner_user_id in (select md5('eodilog-demo-u'||g)::uuid from generate_series(1,10) g)
				 and exists (select 1 from feed_regions fr where fr.feed_id=f.id)
				 and jsonb_array_length(f.snapshot_json->'regions')=(select count(*) from feed_regions fr where fr.feed_id=f.id)""",
				Long.class)).isEqualTo(43);
	}

	@Test
	void regionsGetFriendCountsForEveryColorStep() {
		Map<String, Long> counts = jdbc.queryForList("""
				select r.code, count(distinct t.owner_user_id) as n from feed_regions fr join feeds f on f.id=fr.feed_id
				 join trips t on t.id=f.trip_id join regions r on r.id=fr.region_id
				where t.owner_user_id in (select md5('eodilog-demo-u'||g)::uuid from generate_series(1,10) g)
				group by r.code""").stream()
				.collect(Collectors.toMap(row -> (String) row.get("code"), row -> ((Number) row.get("n")).longValue()));
		assertThat(counts).hasSize(28)
				.containsEntry("5115000000", 7L).containsEntry("5011000000", 6L)
				.containsEntry("2635000000", 5L).containsEntry("4713000000", 5L)
				.containsEntry("1213000000", 3L).containsEntry("5211000000", 3L).containsEntry("5121000000", 3L)
				.containsEntry("5013000000", 2L).containsEntry("4711000000", 2L).containsEntry("5219000000", 1L);
	}

}
