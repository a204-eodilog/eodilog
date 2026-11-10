package com.eodilog.photo.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

@Schema(description = "이번 작업에서 적용한 사진. 동일 본문 재요청은 최초 결과를 반환한다")
public record PhotoClassificationResponse(
        @Schema(description = "적용 후 사진", requiredMode = Schema.RequiredMode.REQUIRED)
        List<PhotoResponse> photos) { }
