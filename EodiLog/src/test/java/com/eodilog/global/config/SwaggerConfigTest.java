package com.eodilog.global.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = "app.cors.allowed-origins=")
@Import(TestcontainersConfiguration.class)
@AutoConfigureMockMvc
class SwaggerConfigTest {

	@Autowired
	private MockMvc mockMvc;

	@Test
	void emptyCorsSettingRejectsCrossOriginButKeepsSameOriginAuthentication() throws Exception {
		mockMvc.perform(options("/api/v1/me").header("Origin", "https://unlisted.example.com")
				.header("Access-Control-Request-Method", "GET"))
				.andExpect(status().isForbidden())
				.andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
		mockMvc.perform(get("/api/v1/me").header("Origin", "http://localhost"))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void apiDocsAccessibleWithoutAuthentication() throws Exception {
		mockMvc.perform(get("/v3/api-docs"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.info.title").value("EodiLog API"))
				.andExpect(jsonPath("$.components.securitySchemes.bearerAuth.scheme").value("bearer"));
	}

	@Test
	void swaggerUiAccessibleWithoutAuthentication() throws Exception {
		mockMvc.perform(get("/swagger-ui/index.html"))
				.andExpect(status().isOk());
	}

	@Test
	void otherPathsStillRequireAuthentication() throws Exception {
		int status = mockMvc.perform(get("/api/v1/anything"))
				.andReturn().getResponse().getStatus();

		assertThat(status).isIn(302, 401);
	}

}
