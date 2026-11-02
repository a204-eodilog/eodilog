package com.eodilog;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.Environment;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
class EodiLogApplicationTests {
	@Autowired
	private Environment environment;

	@Test
	void inheritsMainConfigurationAndOverridesTestCredentials() {
		assertThat(environment.getActiveProfiles()).contains("test");
		assertThat(environment.getProperty("spring.application.name")).isEqualTo("EodiLog");
		assertThat(environment.getProperty("spring.jpa.hibernate.ddl-auto")).isEqualTo("validate");
		assertThat(environment.getProperty("spring.flyway.locations")).isEqualTo("classpath:db/migration");
		assertThat(environment.getProperty("spring.jackson.deserialization.fail-on-unknown-properties", Boolean.class))
				.isTrue();
		assertThat(environment.getProperty("app.auth.kakao-client-id")).isEqualTo("test-client");
		assertThat(environment.getProperty("app.auth.issuer")).isEqualTo("eodilog-test");
		assertThat(environment.getProperty("spring.config.import")).isNull();
	}

}
