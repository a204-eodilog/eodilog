package com.eodilog.trip.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

// 명세 §4 POST /trips 요청. 검증(제목 공백 제거·기간·여행지)은 TripService가 한다
public record CreateTripRequest(
		@Schema(description = "여행 이름. 앞뒤 공백을 제거한 뒤 1~200자", example = "제주 3박 4일",
				requiredMode = Schema.RequiredMode.REQUIRED)
		String title,

		@Schema(description = "시작일. 종료일과 함께 입력하거나 둘 다 생략한다", example = "2026-11-01")
		LocalDate startDate,

		@Schema(description = "종료일. 시작일 이후여야 한다", example = "2026-11-04")
		LocalDate endDate,

		@Schema(description = "여행지 지역 ID 목록. 입력한 순서를 유지하며 중복·없는 지역은 거부한다",
				example = "[\"3f2b8c1e-5d4a-4e7b-9c1f-2a6d8e0b7c45\"]")
		List<UUID> destinationRegionIds
) {
}
