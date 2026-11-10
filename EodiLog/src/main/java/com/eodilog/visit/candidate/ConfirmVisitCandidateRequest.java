package com.eodilog.visit.candidate;

import com.eodilog.photo.dto.StrictLongDeserializer;
import io.swagger.v3.oas.annotations.media.Schema;
import tools.jackson.databind.annotation.JsonDeserialize;

@Schema(description = "방문 후보 확정")
public record ConfirmVisitCandidateRequest(
		@Schema(description = "조회한 후보 version", example = "1", requiredMode = Schema.RequiredMode.REQUIRED)
		@JsonDeserialize(using = StrictLongDeserializer.class) Long expectedVersion) {
}
