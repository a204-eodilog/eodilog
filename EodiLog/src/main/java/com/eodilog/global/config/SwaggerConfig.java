package com.eodilog.global.config;

import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse;
import io.swagger.v3.core.converter.ModelConverters;
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.Operation;
import io.swagger.v3.oas.models.SpecVersion;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.media.Content;
import io.swagger.v3.oas.models.media.MediaType;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.responses.ApiResponse;
import io.swagger.v3.oas.models.responses.ApiResponses;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import java.util.List;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class SwaggerConfig {

	private static final String BEARER_AUTH = "bearerAuth";
	private static final String ERROR_SCHEMA_REF = "#/components/schemas/ErrorResponse";
	private static final List<CommonErrorCode> COMMON_ERRORS = List.of(
			CommonErrorCode.VALIDATION_ERROR,
			CommonErrorCode.UNAUTHENTICATED,
			CommonErrorCode.FORBIDDEN,
			CommonErrorCode.NOT_FOUND,
			CommonErrorCode.INTERNAL_ERROR);

	@Bean
	public OpenAPI openAPI() {
		// API 명세상 인증이 기본 필수이므로 전역 Bearer 요구사항을 걸고, 공개 API는 @SecurityRequirements()로 해제한다
		return new OpenAPI()
				.info(new Info()
						.title("EodiLog API")
						.description("어디로그 백엔드 API 문서")
						.version("v1"))
				.components(new Components()
						.addSecuritySchemes(BEARER_AUTH, new SecurityScheme()
								.type(SecurityScheme.Type.HTTP)
								.scheme("bearer")
								.bearerFormat("JWT")))
				.addSecurityItem(new SecurityRequirement().addList(BEARER_AUTH));
	}

	// 모든 API에 공통 실패(400·401·403·404·500)를 ErrorResponse 형식으로 문서화한다. 공개 API에는 401·403을 넣지 않는다
	// 컨트롤러에 같은 상태 코드의 @ApiResponse가 있으면 그것을 유지한다
	@Bean
	public OpenApiCustomizer commonErrorResponsesCustomizer() {
		return openApi -> {
			boolean openApi31 = openApi.getSpecVersion() == SpecVersion.V31;
			ModelConverters.getInstance(openApi31).readAll(ErrorResponse.class)
					.forEach((name, schema) -> openApi.getComponents().addSchemas(name, schema));
			ModelConverters.getInstance(openApi31)
					.readAll(com.eodilog.expense.voice.VoiceExpenseResult.class)
					.forEach((name, schema) -> openApi.getComponents().addSchemas(name, schema));
			if (openApi.getPaths() == null) {
				return;
			}
			openApi.getPaths().values()
					.forEach(pathItem -> pathItem.readOperations().forEach(this::addCommonErrorResponses));
		};
	}

	private void addCommonErrorResponses(Operation operation) {
		boolean publicApi = operation.getSecurity() != null && operation.getSecurity().isEmpty();
		ApiResponses responses = operation.getResponses();
		for (CommonErrorCode errorCode : COMMON_ERRORS) {
			boolean authError = errorCode == CommonErrorCode.UNAUTHENTICATED || errorCode == CommonErrorCode.FORBIDDEN;
			String status = String.valueOf(errorCode.status().value());
			if ((publicApi && authError) || responses.containsKey(status)) {
				continue;
			}
			responses.addApiResponse(status, new ApiResponse()
					.description(errorCode.code() + ": " + errorCode.message())
					.content(new Content().addMediaType("application/json",
							new MediaType().schema(new Schema<>().$ref(ERROR_SCHEMA_REF)))));
		}
	}

}
