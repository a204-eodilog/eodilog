package com.eodilog.global.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = "app.cors.allowed-origins=https://web.example.com")
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class CorsConfigTest {
	@Autowired MockMvc mockMvc;

	@Test
	void preflightAllowsAgreedHeadersBeforeAuthentication() throws Exception {
		mockMvc.perform(options("/api/v1/trips").header("Origin", "https://web.example.com")
				.header("Access-Control-Request-Method", "POST")
				.header("Access-Control-Request-Headers", "authorization,content-type,idempotency-key"))
				.andExpect(status().isOk())
				.andExpect(header().string("Access-Control-Allow-Origin", "https://web.example.com"))
				.andExpect(header().string("Access-Control-Allow-Headers", "authorization, content-type, idempotency-key"))
				.andExpect(header().doesNotExist("Access-Control-Allow-Credentials"));
	}

	@Test
	void exposesTraceHeaderEvenOnAuthenticationFailure() throws Exception {
		mockMvc.perform(get("/api/v1/me").header("Origin", "https://web.example.com"))
				.andExpect(status().isUnauthorized())
				.andExpect(header().string("Access-Control-Expose-Headers", "X-Trace-Id"))
				.andExpect(header().exists("X-Trace-Id"));
	}

	@Test
	void rejectsUnlistedOriginAndHeader() throws Exception {
		mockMvc.perform(options("/api/v1/trips").header("Origin", "https://evil.example.com")
				.header("Access-Control-Request-Method", "POST"))
				.andExpect(status().isForbidden()).andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
		mockMvc.perform(options("/api/v1/trips").header("Origin", "https://web.example.com")
				.header("Access-Control-Request-Method", "POST").header("Access-Control-Request-Headers", "X-User-Id"))
				.andExpect(status().isForbidden());
		mockMvc.perform(options("/api/v1/trips").header("Origin", "https://web.example.com")
				.header("Access-Control-Request-Method", "TRACE"))
				.andExpect(status().isForbidden());
	}

	@Test
	void defaultsToNoOriginsAndRejectsPatternsAndPaths() {
		assertThat(new CorsProperties(null).allowedOrigins()).isEmpty();
		for (String invalid : List.of("*", "https://*.example.com", "https://web.example.com/path", "null", "ieohaeng://app", "https://web.example.com:", "https://web.example.com:65536")) {
			assertThatThrownBy(() -> new CorsProperties(List.of(invalid))).isInstanceOf(IllegalArgumentException.class);
		}
	}
}
