package com.eodilog.itinerary.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

// 명세 §10 RouteLeg.geometry. GeoJSON LineString 모양이며 좌표는 경도·위도 순이다
public record RouteGeometryResponse(
		@Schema(description = "항상 LineString", example = "LineString", requiredMode = Schema.RequiredMode.REQUIRED)
		String type,

		@Schema(description = "[경도, 위도] 목록", requiredMode = Schema.RequiredMode.REQUIRED)
		List<List<Double>> coordinates
) {
}
