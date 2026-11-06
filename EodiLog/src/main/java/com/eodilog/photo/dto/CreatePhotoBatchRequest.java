package com.eodilog.photo.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

@Schema(description = "사진 업로드 배치 생성")
public record CreatePhotoBatchRequest(
        @Schema(description = "배치 파일 수(1~50)", example = "10", requiredMode = Schema.RequiredMode.REQUIRED)
        @NotNull @Positive Integer fileCount) { }
