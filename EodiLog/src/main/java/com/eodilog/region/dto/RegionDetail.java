package com.eodilog.region.dto;

import java.util.List;
import com.eodilog.place.dto.PlaceView;
import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "지역 상세")
public record RegionDetail(
        @Schema(description = "지역", requiredMode = Schema.RequiredMode.REQUIRED) RegionView region,
        @Schema(description = "지역 소개, 현재 null", nullable = true, example = "null") String introduction,
        @Schema(description = "대표 장소, 현재 빈 목록", requiredMode = Schema.RequiredMode.REQUIRED) List<PlaceView> representativePlaces,
        @Schema(description = "부분 오류, 현재 빈 목록", requiredMode = Schema.RequiredMode.REQUIRED) List<String> partialErrors) {
    public static RegionDetail of(RegionView region) { return new RegionDetail(region, null, List.of(), List.of()); }
}
