package com.eodilog.visit.candidate;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;

@Schema(description = "방문 후보를 찾을 내 사진. 중복 없이 1~50장")
public record VisitDetectionRequest(
		@Schema(description = "이 여행에 내가 올린 사진 ID", example = "[\"0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6ec0\"]",
				requiredMode = Schema.RequiredMode.REQUIRED)
		@NotEmpty List<@NotNull UUID> photoIds) {
}
