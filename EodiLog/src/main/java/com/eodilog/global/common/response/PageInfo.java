package com.eodilog.global.common.response;

import io.swagger.v3.oas.annotations.media.Schema;

public record PageInfo(
		@Schema(description = "다음 페이지 커서. 마지막 페이지면 null", example = "eyJjcmVhdGVkQXQiOiIyMDI2LTEwLTI4VDAxOjAwOjAwWiJ9",
				requiredMode = Schema.RequiredMode.REQUIRED, nullable = true)
		String nextCursor,

		@Schema(description = "다음 페이지 존재 여부", example = "false", requiredMode = Schema.RequiredMode.REQUIRED)
		boolean hasNext
) {
}
