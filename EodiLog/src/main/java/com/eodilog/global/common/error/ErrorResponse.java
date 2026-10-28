package com.eodilog.global.common.error;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

// API 명세 §2의 공통 실패 응답 { "error": { "code", "message", "fields", "traceId" } }
public record ErrorResponse(
		@Schema(requiredMode = Schema.RequiredMode.REQUIRED)
		ErrorBody error
) {

	public static ErrorResponse of(ErrorCode errorCode, String traceId) {
		return of(errorCode, errorCode.message(), List.of(), traceId);
	}

	public static ErrorResponse of(ErrorCode errorCode, String message, List<ErrorField> fields, String traceId) {
		return new ErrorResponse(new ErrorBody(errorCode.code(), message, fields, traceId));
	}

	public record ErrorBody(
			@Schema(description = "오류 코드", example = "VERSION_CONFLICT", requiredMode = Schema.RequiredMode.REQUIRED)
			String code,

			@Schema(description = "사용자에게 보여도 되는 오류 문구", example = "일정이 변경되었습니다. 다시 조회해 주세요.",
					requiredMode = Schema.RequiredMode.REQUIRED)
			String message,

			@Schema(description = "입력 오류가 난 필드 목록. 없으면 빈 배열", requiredMode = Schema.RequiredMode.REQUIRED)
			List<ErrorField> fields,

			@Schema(description = "요청 추적 ID. 응답 헤더 X-Trace-Id와 같다", example = "6f1c2a7e9b3d4f0a8c5e1b2d3f4a5b6c",
					requiredMode = Schema.RequiredMode.REQUIRED)
			String traceId
	) {
	}

	public record ErrorField(
			@Schema(description = "필드 경로", example = "title", requiredMode = Schema.RequiredMode.REQUIRED)
			String field,

			@Schema(description = "필드 오류 문구", example = "공백일 수 없습니다", requiredMode = Schema.RequiredMode.REQUIRED)
			String message
	) {
	}

}
