package com.eodilog.global.common.response;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

// API 명세 §2의 목록 성공 응답 { "data": [...], "page": { "nextCursor", "hasNext" } }
public record PageResponse<T>(
		@Schema(description = "목록 자료", requiredMode = Schema.RequiredMode.REQUIRED)
		List<T> data,

		@Schema(description = "다음 페이지 정보", requiredMode = Schema.RequiredMode.REQUIRED)
		PageInfo page
) {

	public static <T> PageResponse<T> of(List<T> data, String nextCursor, boolean hasNext) {
		return new PageResponse<>(data, new PageInfo(nextCursor, hasNext));
	}

}
