package com.eodilog.photo.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.UUID;

@Schema(description = "사진 업로드 배치(기본 등록 기한 24시간)")
public record PhotoBatchResponse(
        @Schema(description = "배치 ID", example = "019a0000-0000-7000-8000-000000000002") UUID id,
        @Schema(description = "여행 ID", example = "019a0000-0000-7000-8000-000000000001") UUID tripId,
        @Schema(description = "등록 상한", example = "10") int fileCount,
        @Schema(description = "등록 완료 수", example = "0") int registeredCount,
        @Schema(description = "배치 생성 시각(UTC)", example = "2026-11-06T12:00:00Z") Instant createdAt) { }
