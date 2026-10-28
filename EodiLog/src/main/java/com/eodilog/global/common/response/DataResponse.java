package com.eodilog.global.common.response;

import io.swagger.v3.oas.annotations.media.Schema;

// API 명세 §2의 단건 성공 응답 { "data": ... }
public record DataResponse<T>(
		@Schema(description = "응답 자료", requiredMode = Schema.RequiredMode.REQUIRED)
		T data
) {

	public static <T> DataResponse<T> of(T data) {
		return new DataResponse<>(data);
	}

}
