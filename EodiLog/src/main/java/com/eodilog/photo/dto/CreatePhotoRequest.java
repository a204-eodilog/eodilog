package com.eodilog.photo.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.UUID;

@Schema(description = "검증된 여행 사진 등록")
public record CreatePhotoRequest(
        @Schema(description = "본인 업로드 배치 ID", example = "019a0000-0000-7000-8000-000000000002", requiredMode = Schema.RequiredMode.REQUIRED) @NotNull UUID batchId,
        @Schema(description = "READY 여행 사진 파일 ID", example = "019a0000-0000-7000-8000-000000000003", requiredMode = Schema.RequiredMode.REQUIRED) @NotNull UUID assetId,
        @Schema(description = "연결할 장소 ID", example = "019a0000-0000-7000-8000-000000000004") UUID placeId,
        @Schema(description = "사용자가 지정한 촬영 시각(UTC)", example = "2026-11-06T12:00:00Z") Instant capturedAt) { }
