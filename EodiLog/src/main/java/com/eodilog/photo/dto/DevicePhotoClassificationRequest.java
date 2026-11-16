package com.eodilog.photo.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;
import java.util.UUID;

@Schema(description = "휴대폰에서 분류한 본인 사진 결과. 중복 없이 1~50장")
public record DevicePhotoClassificationRequest(
        @Schema(description = "사진별 분류 결과", requiredMode = Schema.RequiredMode.REQUIRED)
        @NotEmpty @Valid List<@NotNull @Valid Photo> photos) {
    public record Photo(
            @Schema(description = "사진 ID", requiredMode = Schema.RequiredMode.REQUIRED) @NotNull UUID photoId,
            @Schema(description = "휴대폰이 마지막으로 본 사진 버전. JSON 정수만 허용", example = "1", requiredMode = Schema.RequiredMode.REQUIRED)
            @tools.jackson.databind.annotation.JsonDeserialize(using = StrictLongDeserializer.class) @NotNull @Min(1) Long expectedVersion,
            @Schema(description = "사진 주제 하나", allowableValues = {"LANDSCAPE", "FOOD", "PEOPLE", "OTHER"}, example = "FOOD",
                    requiredMode = Schema.RequiredMode.REQUIRED)
            @NotNull @Pattern(regexp = "LANDSCAPE|FOOD|PEOPLE|OTHER") String topic,
            @Schema(description = "휴대폰이 정한 유사 사진 묶음 키. 이번 요청에서 2장 이상 같은 키면 새 묶음, 생략·null은 묶음 없음",
                    example = "g1", minLength = 1, maxLength = 64, nullable = true)
            @Size(min = 1, max = 64) String groupKey) { }
}
