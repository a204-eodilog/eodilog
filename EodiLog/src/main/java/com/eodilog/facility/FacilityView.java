package com.eodilog.facility;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;

/** 명세 Facility. 실시간 상태를 확인하지 못했으면 availability가 null이다 */
public record FacilityView(
		@Schema(description = "시설 ID. 충전소는 공급자 충전소 ID, 화장실·약국·편의점·주유소는 우리 ID(UUID)", example = "ME174013",
				requiredMode = Schema.RequiredMode.REQUIRED)
		String providerId,

		@Schema(description = "이름", example = "낙성대동주민센터", requiredMode = Schema.RequiredMode.REQUIRED)
		String name,

		@Schema(description = "시설 종류", example = "EV_CHARGER", requiredMode = Schema.RequiredMode.REQUIRED)
		FacilityType type,

		@Schema(description = "위도", example = "37.476296", requiredMode = Schema.RequiredMode.REQUIRED)
		double latitude,

		@Schema(description = "경도", example = "126.9583876", requiredMode = Schema.RequiredMode.REQUIRED)
		double longitude,

		@Schema(description = "기준 장소에서 걷는 시간(초). 직선거리에 1.3을 곱해 시속 4.5km로 어림한 값", example = "300")
		Integer walkingSeconds,

		@Schema(description = "확인된 이용 상태. 충전소만 있고(예: '급속 2대 사용 가능'), 확인하지 못했으면 null",
				example = "급속 2대 사용 가능")
		String availability,

		@Schema(description = "상태를 확인한 시각(UTC). 충전소는 마지막 상태 갱신 시각, 그 밖은 응답 시각",
				example = "2026-11-11T01:15:00Z", requiredMode = Schema.RequiredMode.REQUIRED)
		Instant queriedAt) {
}
