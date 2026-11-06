package com.eodilog.asset.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Schema(description = "업로드 URL. method·headers 그대로 uploadUrl에 파일 바이트를 보낸 뒤 complete를 부른다. "
		+ "이 URL에는 API 인증 헤더(Authorization)를 붙이지 않는다")
public record UploadIntentResponse(
		@Schema(description = "파일 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6ed0",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID assetId,

		@Schema(description = "파일을 올릴 서명 URL(저장소 주소). expiresAt까지만 쓸 수 있다",
				example = "https://eodilog-dev-a204.s3.ap-northeast-2.amazonaws.com/trip-photo/...?X-Amz-Signature=...",
				requiredMode = Schema.RequiredMode.REQUIRED)
		String uploadUrl,

		@Schema(description = "HTTP 메서드", example = "PUT", requiredMode = Schema.RequiredMode.REQUIRED)
		String method,

		@Schema(description = "업로드 요청에 그대로 넣어야 하는 헤더(서명에 포함됨)",
				example = "{\"content-type\":\"image/jpeg\",\"content-length\":\"2483017\"}",
				requiredMode = Schema.RequiredMode.REQUIRED)
		Map<String, String> headers,

		@Schema(description = "업로드 URL 만료 시각(UTC)", example = "2026-11-06T05:10:00Z",
				requiredMode = Schema.RequiredMode.REQUIRED)
		Instant expiresAt
) {
}
