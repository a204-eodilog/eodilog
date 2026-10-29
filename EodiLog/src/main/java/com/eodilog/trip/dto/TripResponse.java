package com.eodilog.trip.dto;

import com.eodilog.trip.domain.Trip;
import com.eodilog.trip.domain.TripStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

// 명세 §10 Trip. members는 ACTIVE 멤버만 joinOrder 순으로 담는다
public record TripResponse(
		@Schema(description = "여행 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID id,

		@Schema(description = "여행 이름", example = "제주 3박 4일", requiredMode = Schema.RequiredMode.REQUIRED)
		String title,

		@Schema(description = "시작일. 미정이면 null", example = "2026-11-01", requiredMode = Schema.RequiredMode.REQUIRED,
				nullable = true)
		LocalDate startDate,

		@Schema(description = "종료일. 미정이면 null", example = "2026-11-04", requiredMode = Schema.RequiredMode.REQUIRED,
				nullable = true)
		LocalDate endDate,

		@Schema(description = "여행지 지역 ID 목록(입력 순서)", requiredMode = Schema.RequiredMode.REQUIRED)
		List<UUID> destinationRegionIds,

		@Schema(description = "기간으로 자동 판정한 상태", example = "PLANNING", requiredMode = Schema.RequiredMode.REQUIRED)
		TripStatus status,

		@Schema(description = "통화. KRW 고정", example = "KRW", requiredMode = Schema.RequiredMode.REQUIRED)
		String currency,

		@Schema(description = "방장 멤버십 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e7f",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID ownerMemberId,

		@Schema(description = "활성 멤버 목록(참여 순)", requiredMode = Schema.RequiredMode.REQUIRED)
		List<TripMemberResponse> members,

		@Schema(description = "여행 정보 버전. 수정 시 expectedVersion으로 보낸다", example = "1",
				requiredMode = Schema.RequiredMode.REQUIRED)
		long version,

		@Schema(description = "경비 버전", example = "0", requiredMode = Schema.RequiredMode.REQUIRED)
		long expenseVersion
) {

	// status는 저장 값이 아니라 조회 시점에 계산한 값을 받는다
	public static TripResponse of(Trip trip, TripStatus status, List<UUID> destinationRegionIds, UUID ownerMemberId,
			List<TripMemberResponse> members) {
		return new TripResponse(trip.getId(), trip.getTitle(), trip.getStartDate(), trip.getEndDate(),
				destinationRegionIds, status, trip.getCurrency(), ownerMemberId, members,
				trip.getVersion(), trip.getExpenseVersion());
	}

}
