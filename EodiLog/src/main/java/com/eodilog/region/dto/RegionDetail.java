package com.eodilog.region.dto;

import java.util.List;
import com.eodilog.place.dto.PlaceView;
import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "지역 상세")
public record RegionDetail(
        @Schema(description = "지역", requiredMode = Schema.RequiredMode.REQUIRED) RegionView region,
        @Schema(description = "지역 소개, 항상 null", nullable = true, example = "null") String introduction,
        @Schema(description = "대표 장소 최대 5개. 이 지역과 하위 지역에서 요청자에게 허용된 살아 있는 게시 피드 수가 많은 장소 순(같으면 장소 ID 오름차순)", requiredMode = Schema.RequiredMode.REQUIRED) List<PlaceView> representativePlaces,
        @Schema(description = "부분 오류, 외부 호출이 없어 항상 빈 목록", requiredMode = Schema.RequiredMode.REQUIRED) List<String> partialErrors) {
    public static RegionDetail of(RegionView region, List<PlaceView> representativePlaces) {
        return new RegionDetail(region, null, List.copyOf(representativePlaces), List.of());
    }
}
