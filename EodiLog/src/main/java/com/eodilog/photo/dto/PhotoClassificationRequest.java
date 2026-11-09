package com.eodilog.photo.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;

@Schema(description = "AI로 분석할 사진. 중복 없이 1~50장")
public record PhotoClassificationRequest(
        @Schema(description = "같은 여행의 사진 ID", requiredMode = Schema.RequiredMode.REQUIRED)
        @NotEmpty List<@NotNull UUID> photoIds) { }
