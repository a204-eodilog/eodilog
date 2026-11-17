package com.eodilog.invitation.dto;

import com.eodilog.user.dto.UserCard;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

// 받은 앱 내 초대. 링크 미리보기와 같이 동행 명단·경비는 담지 않는다
public record ReceivedTripInvitationResponse(
		@Schema(description = "초대 ID", requiredMode = Schema.RequiredMode.REQUIRED)
		UUID id,

		@Schema(description = "초대받은 여행", requiredMode = Schema.RequiredMode.REQUIRED)
		TripBrief trip,

		@Schema(description = "초대한 사람의 회원 카드", requiredMode = Schema.RequiredMode.REQUIRED)
		UserCard inviter,

		@Schema(description = "PENDING: 수락 가능, EXPIRED: 기간 지남·여행 삭제·초대한 사람이 나감, "
				+ "ACCEPTED·DECLINED·CANCELED: 처리됨", requiredMode = Schema.RequiredMode.REQUIRED)
		Status status,

		@Schema(description = "이미 이 여행의 동행인지", example = "false", requiredMode = Schema.RequiredMode.REQUIRED)
		boolean alreadyMember,

		@Schema(description = "초대 만료 시각(UTC)", requiredMode = Schema.RequiredMode.REQUIRED)
		Instant expiresAt,

		@Schema(description = "보낸 시각(UTC)", requiredMode = Schema.RequiredMode.REQUIRED)
		Instant createdAt
) {

	public enum Status { PENDING, EXPIRED, ACCEPTED, DECLINED, CANCELED }

	public record TripBrief(
			@Schema(description = "여행 ID", requiredMode = Schema.RequiredMode.REQUIRED)
			UUID id,

			@Schema(description = "여행 이름", example = "부산 2박3일", requiredMode = Schema.RequiredMode.REQUIRED)
			String title,

			@Schema(description = "시작일, 미정이면 null", nullable = true, requiredMode = Schema.RequiredMode.REQUIRED)
			LocalDate startDate,

			@Schema(description = "종료일, 미정이면 null", nullable = true, requiredMode = Schema.RequiredMode.REQUIRED)
			LocalDate endDate,

			@Schema(description = "지금 ACTIVE 멤버 수", example = "4", requiredMode = Schema.RequiredMode.REQUIRED)
			long memberCount
	) {
	}

}
