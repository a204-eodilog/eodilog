package com.eodilog.itinerary.dto;

import com.eodilog.itinerary.domain.RouteLegStatus;
import com.eodilog.itinerary.domain.TransportMode;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.UUID;

// 명세 §10 RouteLeg. 경로 공급자 연동 전에는 시간·거리·지도선이 모두 null이고 status는 UNAVAILABLE이다
public record RouteLegResponse(
		@Schema(description = "출발 항목 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e50",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID fromItemId,

		@Schema(description = "도착 항목 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e51",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID toItemId,

		@Schema(description = "이동 수단", example = "TRANSIT", requiredMode = Schema.RequiredMode.REQUIRED)
		TransportMode transportMode,

		@Schema(description = "예상 이동 시간(초). 조회 전·실패면 null", requiredMode = Schema.RequiredMode.REQUIRED,
				nullable = true)
		Integer durationSeconds,

		@Schema(description = "예상 거리(m). 조회 전·실패면 null", requiredMode = Schema.RequiredMode.REQUIRED, nullable = true)
		Integer distanceMeters,

		@Schema(description = "지도 경로 LineString(좌표는 경도·위도 순). 조회 전·실패면 null",
				requiredMode = Schema.RequiredMode.REQUIRED, nullable = true)
		RouteGeometryResponse geometry,

		@Schema(description = "AVAILABLE: 경로 결과 있음 / UNAVAILABLE: 조회 전이거나 실패", example = "UNAVAILABLE",
				requiredMode = Schema.RequiredMode.REQUIRED)
		RouteLegStatus status,

		@Schema(description = "경로를 조회(시도)한 시각(UTC). 조회 전이면 저장 시각", example = "2026-11-03T01:00:00Z",
				requiredMode = Schema.RequiredMode.REQUIRED)
		Instant queriedAt
) {
}
