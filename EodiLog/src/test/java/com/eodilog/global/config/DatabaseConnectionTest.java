package com.eodilog.global.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.eodilog.TestcontainersConfiguration;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
class DatabaseConnectionTest {

	@Autowired
	private EntityManager entityManager;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Test
	void jpaQueriesPostgis() {
		Object version = entityManager.createNativeQuery("select postgis_version()").getSingleResult();

		assertThat(version).asString().startsWith("3.5");
	}

	@Test
	void flywayAppliesPostgisMigration() {
		Boolean applied = jdbcTemplate.queryForObject(
				"select success from flyway_schema_history where version = ?", Boolean.class, "202610281000");

		assertThat(applied).isTrue();
	}

}
