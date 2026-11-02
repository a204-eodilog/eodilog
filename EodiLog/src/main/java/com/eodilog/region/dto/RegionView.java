package com.eodilog.region.dto;

import java.math.BigDecimal;
import java.util.UUID;
import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "법정동 기반 지역")
public record RegionView(
        @Schema(description = "지역 UUID", example = "019a42dc-0000-7000-8000-000000000001", requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
        @Schema(description = "법정동 코드", example = "1100000000", requiredMode = Schema.RequiredMode.REQUIRED) String code,
        @Schema(description = "공식 전체 법정동명", example = "서울특별시 종로구", requiredMode = Schema.RequiredMode.REQUIRED) String name,
        @Schema(description = "상위 지역 UUID, 최상위는 null", nullable = true, example = "019a42dc-0000-7000-8000-000000000001") UUID parentId,
        @Schema(description = "대표 위도, 미확보 시 null", nullable = true, example = "37.5729000") BigDecimal latitude,
        @Schema(description = "대표 경도, 미확보 시 null", nullable = true, example = "126.9794000") BigDecimal longitude) { }
