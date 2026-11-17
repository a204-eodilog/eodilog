package com.eodilog.global.config;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

// 테스트 DB 컨테이너는 모든 테스트가 함께 쓴다. 운영 전용 데모 마이그레이션(db/demo)이 들어가면 다른 컨텍스트의 Flyway 검증이 깨지므로 뺀다
@SpringBootTest(properties = "spring.flyway.locations=classpath:db/migration")
@AutoConfigureMockMvc
@ActiveProfiles({"test", "prod"})
@Import(TestcontainersConfiguration.class)
class ProductionConfigTest {
	@Autowired MockMvc mockMvc;

	@Test
	void disablesSwaggerAndApiDocs() throws Exception {
		for (String path : new String[] {"/v3/api-docs", "/v3/api-docs/swagger-config", "/swagger-ui.html", "/swagger-ui/index.html"}) {
			mockMvc.perform(get(path)).andExpect(status().isNotFound());
		}
	}

	@Test
	void keepsProtectedApiAuthentication() throws Exception {
		mockMvc.perform(get("/api/v1/me")).andExpect(status().isUnauthorized());
	}
}
