package com.eodilog.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import com.eodilog.global.security.AuthUser;
import com.eodilog.user.dto.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.support.JdbcTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

// This context deliberately excludes application scanning, auth settings and auth tables.
@Testcontainers
class UserCardReaderTest {

	@Container
	static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17");

	@TempDir
	static Path migrations;

	static AnnotationConfigApplicationContext context;
	static JdbcTemplate jdbc;
	static UserCardReader reader;
	static TransactionTemplate tx;

	@Configuration(proxyBeanMethods = false)
	@EnableTransactionManagement
	static class Config {
		@Bean
		DriverManagerDataSource dataSource() {
			return new DriverManagerDataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
		}

		@Bean
		NamedParameterJdbcTemplate namedJdbc(DriverManagerDataSource source) {
			return spy(new NamedParameterJdbcTemplate(source));
		}

		@Bean
		JdbcTransactionManager transactionManager(DriverManagerDataSource source) {
			return new JdbcTransactionManager(source);
		}

		@Bean
		UserCardReader userCards(NamedParameterJdbcTemplate namedJdbc) {
			return new JdbcUserCardReader(namedJdbc);
		}
	}

	@BeforeAll
	static void initializeUsersOnly() throws Exception {
		try (var input = UserCardReaderTest.class.getResourceAsStream("/db/migration/V202610281100__create_users.sql")) {
			Files.copy(Objects.requireNonNull(input), migrations.resolve("V202610281100__create_users.sql"));
		}
		Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
				.locations("filesystem:" + migrations).load().migrate();
		context = new AnnotationConfigApplicationContext(Config.class);
		jdbc = new JdbcTemplate(context.getBean(DriverManagerDataSource.class));
		reader = context.getBean(UserCardReader.class);
		tx = new TransactionTemplate(context.getBean(JdbcTransactionManager.class));
	}

	@AfterAll
	static void close() {
		if (context != null) context.close();
	}

	@BeforeEach
	void clean() {
		jdbc.update("DELETE FROM users");
	}

	void insert(UUID id, String status) {
		jdbc.update("INSERT INTO users(id,nickname,profile_completed,status,created_at,updated_at) VALUES(?,'reader',true,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)", id, status);
	}

	@Test
	void mixedIdsIncludeInactiveDeduplicateAndExposeOnlyPublicFields() {
		UUID active = UUID.randomUUID(), inactive = UUID.randomUUID();
		insert(active, "ACTIVE");
		insert(inactive, "DEACTIVATED");
		jdbc.update("UPDATE users SET account_visibility='PUBLIC' WHERE id=?", active);
		var template = context.getBean(NamedParameterJdbcTemplate.class);
		clearInvocations(template);
		var cards = reader.findCards(active, List.of(active, inactive, active, UUID.randomUUID()));
		verify(template, times(1)).query(anyString(), anyMap(), org.mockito.ArgumentMatchers.<RowMapper<UserCard>>any());
		assertThat(cards).containsOnlyKeys(active, inactive);
		assertThat(cards.get(active).accountVisibility()).isEqualTo(AccountVisibility.PUBLIC);
		assertThat(cards.get(active).nickname()).isEqualTo("reader");
		assertThat(cards.get(inactive).accountVisibility()).isEqualTo(AccountVisibility.PRIVATE);
		assertThat(cards.get(inactive)).isEqualTo(new UserCard(inactive, "탈퇴한 사용자", null,
				AccountVisibility.PRIVATE, FollowStatus.NONE, FollowStatus.NONE));
		assertThat(jdbc.queryForObject("SELECT nickname FROM users WHERE id=?", String.class, inactive)).isEqualTo("reader");
		assertThat(Arrays.stream(UserCard.class.getRecordComponents()).map(c -> c.getName()))
				.containsExactly("id", "nickname", "profileImageUrl", "accountVisibility", "followingStatus", "followedByStatus");
		assertThat(jdbc.queryForList("SELECT tablename FROM pg_tables WHERE schemaname='public'", String.class))
				.containsExactlyInAnyOrder("users", "flyway_schema_history");
		assertThat(new AuthUser(active).userId()).isEqualTo(active);
	}

	@Test
	void emptyInputDoesNotQuery() {
		var template = mock(NamedParameterJdbcTemplate.class);
		assertThat(new JdbcUserCardReader(template).findCards(UUID.randomUUID(), List.of())).isEmpty();
		verifyNoInteractions(template);
	}

	@Test
	void joinsCallerTransactionAndReadsUncommittedInsert() {
		UUID id = UUID.randomUUID();
		tx.executeWithoutResult(status -> {
			insert(id, "ACTIVE");
			assertThat(reader.findCards(id, List.of(id))).containsKey(id);
			status.setRollbackOnly();
		});
		assertThat(reader.findCards(id, List.of(id))).isEmpty();
	}
}
