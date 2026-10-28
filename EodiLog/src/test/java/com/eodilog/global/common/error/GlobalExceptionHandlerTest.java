package com.eodilog.global.common.error;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.common.response.DataResponse;
import com.eodilog.global.common.response.PageResponse;
import com.eodilog.global.common.trace.TraceIdFilter;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@SpringBootTest
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, GlobalExceptionHandlerTest.SampleController.class})
@WithMockUser
class GlobalExceptionHandlerTest {

	@Autowired
	private MockMvc mockMvc;

	@Test
	void wrapsSingleResultInData() throws Exception {
		mockMvc.perform(get("/test/errors/data"))
				.andExpect(status().isOk())
				.andExpect(header().string(TraceIdFilter.HEADER_NAME, matchesPattern("[0-9a-f]{32}")))
				.andExpect(jsonPath("$.data.title").value("제주"));
	}

	@Test
	void wrapsListWithPageInfo() throws Exception {
		mockMvc.perform(get("/test/errors/page"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data[0].title").value("제주"))
				.andExpect(jsonPath("$.page").value(hasKey("nextCursor")))
				.andExpect(jsonPath("$.page.nextCursor").value(nullValue()))
				.andExpect(jsonPath("$.page.hasNext").value(false));
	}

	@Test
	void reportsBeanValidationFields() throws Exception {
		MvcResult result = mockMvc.perform(post("/test/errors/validation").with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"title\":\" \"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
				.andExpect(jsonPath("$.error.fields[0].field").value("title"))
				.andReturn();

		String traceId = result.getResponse().getHeader(TraceIdFilter.HEADER_NAME);
		assertThat(result.getResponse().getContentAsString()).contains("\"traceId\":\"" + traceId + "\"");
	}

	@Test
	void rejectsUnknownField() throws Exception {
		mockMvc.perform(post("/test/errors/validation").with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"title\":\"제주\",\"status\":\"ONGOING\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
				.andExpect(jsonPath("$.error.fields[0].field").value("status"));
	}

	@Test
	void rejectsMalformedJson() throws Exception {
		mockMvc.perform(post("/test/errors/validation").with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"title\":"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
				.andExpect(jsonPath("$.error.fields").isEmpty());
	}

	@Test
	void reportsRequestParameterValidation() throws Exception {
		mockMvc.perform(get("/test/errors/params").param("limit", "0"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
				.andExpect(jsonPath("$.error.fields[0].field").value("limit"));
	}

	@Test
	void mapsBusinessExceptionToItsErrorCode() throws Exception {
		mockMvc.perform(get("/test/errors/business"))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("SAMPLE_CONFLICT"))
				.andExpect(jsonPath("$.error.message").value("샘플 충돌입니다."))
				.andExpect(jsonPath("$.error.fields").isEmpty())
				.andExpect(jsonPath("$.error.traceId").value(matchesPattern("[0-9a-f]{32}")));
	}

	@Test
	void mapsAccessDeniedToForbidden() throws Exception {
		mockMvc.perform(get("/test/errors/access-denied"))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
	}

	@Test
	void hidesUnexpectedExceptionMessage() throws Exception {
		mockMvc.perform(get("/test/errors/unexpected"))
				.andExpect(status().isInternalServerError())
				.andExpect(jsonPath("$.error.code").value("INTERNAL_ERROR"))
				.andExpect(jsonPath("$.error.message").value(not("내부 비밀 정보")));
	}

	@Test
	void mapsUnknownPathToNotFound() throws Exception {
		mockMvc.perform(get("/test/errors/missing"))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
	}

	@Test
	void mapsUnsupportedMethod() throws Exception {
		mockMvc.perform(post("/test/errors/data").with(csrf()))
				.andExpect(status().isMethodNotAllowed())
				.andExpect(jsonPath("$.error.code").value("METHOD_NOT_ALLOWED"));
	}

	@Test
	void documentsCommonErrorResponses() throws Exception {
		mockMvc.perform(get("/v3/api-docs"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.components.schemas.ErrorResponse").exists())
				.andExpect(jsonPath("$.paths['/test/errors/data'].get.responses['500'].content['application/json'].schema['$ref']")
						.value("#/components/schemas/ErrorResponse"))
				.andExpect(jsonPath("$.paths['/test/errors/data'].get.responses['401']").exists())
				.andExpect(jsonPath("$.paths['/test/errors/business'].get.responses['409']").doesNotExist());
	}

	enum SampleErrorCode implements ErrorCode {

		SAMPLE_CONFLICT;

		@Override
		public HttpStatus status() {
			return HttpStatus.CONFLICT;
		}

		@Override
		public String code() {
			return name();
		}

		@Override
		public String message() {
			return "샘플 충돌입니다.";
		}

	}

	record SampleRequest(@NotBlank String title) {
	}

	record SampleItem(String title) {
	}

	@RestController
	@RequestMapping("/test/errors")
	static class SampleController {

		@GetMapping("/data")
		DataResponse<SampleItem> data() {
			return DataResponse.of(new SampleItem("제주"));
		}

		@GetMapping("/page")
		PageResponse<SampleItem> page() {
			return PageResponse.of(List.of(new SampleItem("제주")), null, false);
		}

		@PostMapping("/validation")
		DataResponse<SampleItem> validation(@Valid @RequestBody SampleRequest request) {
			return DataResponse.of(new SampleItem(request.title()));
		}

		@GetMapping("/params")
		DataResponse<Integer> params(@RequestParam @Min(1) int limit) {
			return DataResponse.of(limit);
		}

		@GetMapping("/business")
		DataResponse<SampleItem> business() {
			throw new BusinessException(SampleErrorCode.SAMPLE_CONFLICT);
		}

		@GetMapping("/access-denied")
		DataResponse<SampleItem> accessDenied() {
			throw new AccessDeniedException("denied");
		}

		@GetMapping("/unexpected")
		DataResponse<SampleItem> unexpected() {
			throw new IllegalStateException("내부 비밀 정보");
		}

	}

}
