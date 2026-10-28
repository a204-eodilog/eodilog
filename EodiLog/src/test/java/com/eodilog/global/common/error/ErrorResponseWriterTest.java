package com.eodilog.global.common.error;

import static org.assertj.core.api.Assertions.assertThat;

import com.eodilog.global.common.trace.TraceIdFilter;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletResponse;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class ErrorResponseWriterTest {

	private final JsonMapper jsonMapper = JsonMapper.builder().build();
	private final ErrorResponseWriter writer = new ErrorResponseWriter(jsonMapper);

	@AfterEach
	void clearMdc() {
		MDC.clear();
	}

	@Test
	void writesCommonErrorBody() throws Exception {
		MDC.put(TraceIdFilter.MDC_KEY, "trace-1");
		MockHttpServletResponse response = new MockHttpServletResponse();

		writer.write(response, CommonErrorCode.UNAUTHENTICATED);

		JsonNode error = jsonMapper.readTree(response.getContentAsString()).get("error");
		assertThat(response.getStatus()).isEqualTo(401);
		assertThat(response.getContentType()).startsWith("application/json");
		assertThat(error.get("code").asString()).isEqualTo("UNAUTHENTICATED");
		assertThat(error.get("message").asString()).isEqualTo(CommonErrorCode.UNAUTHENTICATED.message());
		assertThat(error.get("fields").isEmpty()).isTrue();
		assertThat(error.get("traceId").asString()).isEqualTo("trace-1");
	}

}
