package com.eodilog.extraction;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;

// POST /extractions 본문(명세 §5). url과 captureAssetIds 중 하나 이상이 필요하다
@Schema(description = "장소 추출 요청. url과 captureAssetIds 중 하나 이상 필요")
public record ExtractionRequest(
		@Schema(description = "SNS 게시물·블로그 링크. http(s) 공개 주소, 2048자 이하", example = "https://blog.example.com/post/123",
				nullable = true)
		String url,

		@Schema(description = "캡처 파일 ID 목록. 내가 올려 확인(complete)까지 끝낸 CAPTURE 용도 JPG/PNG, 최대 10장·중복 불가",
				example = "[\"019a0000-0000-7000-8000-000000000101\"]", nullable = true)
		List<UUID> captureAssetIds,

		@Schema(description = "메모. 500자 이하", example = "부산 여행 때 가 볼 카페", nullable = true)
		String memo) {
}
