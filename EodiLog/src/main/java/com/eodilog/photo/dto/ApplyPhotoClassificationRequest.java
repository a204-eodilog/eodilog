package com.eodilog.photo.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;
import java.util.UUID;

@Schema(description = "성공한 사진 중 적용할 사진과 분석 당시 버전")
public record ApplyPhotoClassificationRequest(
        @Schema(description = "적용할 사진별 버전", requiredMode = Schema.RequiredMode.REQUIRED)
        @NotEmpty @Valid List<@NotNull @Valid PhotoVersion> expectedPhotoVersions) {
    public record PhotoVersion(
            @Schema(description = "사진 ID", requiredMode = Schema.RequiredMode.REQUIRED) @NotNull UUID photoId,
            @Schema(description = "분석 당시 버전. JSON 정수만 허용", example = "1", requiredMode = Schema.RequiredMode.REQUIRED)
            @tools.jackson.databind.annotation.JsonDeserialize(using = StrictLongDeserializer.class) @NotNull @Min(1) Long version) { }
}
