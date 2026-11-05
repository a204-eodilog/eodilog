package com.eodilog.visit.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import tools.jackson.databind.annotation.JsonDeserialize;

// 명세 §7 PUT /trips/{tripId}/visits/{visitId}/review. 검증은 ReviewService가 한다
public record ReviewWriteRequest(
		@Schema(description = "점수. 1~5 정수만 받는다(반 점·문자열 거부)", example = "4", minimum = "1", maximum = "5",
				requiredMode = Schema.RequiredMode.REQUIRED)
		@JsonDeserialize(using = StrictIntegerDeserializer.class)
		Integer score,

		@Schema(description = "평가 본문. 공백만은 안 되고 1,000자까지. 받은 그대로 저장한다", example = "바다가 보이는 자리라 좋았어요.",
				requiredMode = Schema.RequiredMode.REQUIRED)
		String body,

		@Schema(description = "수정할 때 조회한 평가의 version. 생략하면 덮어쓴다. 아직 평가가 없는데 보내면 400", example = "1",
				nullable = true)
		Long expectedVersion
) {
}
