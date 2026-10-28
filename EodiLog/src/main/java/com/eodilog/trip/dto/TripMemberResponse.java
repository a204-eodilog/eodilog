package com.eodilog.trip.dto;

import com.eodilog.trip.domain.TripMember;
import com.eodilog.trip.domain.TripMemberStatus;
import com.eodilog.user.dto.UserCard;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.UUID;

// 명세 §10 Member. role은 저장하지 않고 여행의 방장과 비교해 계산한다
public record TripMemberResponse(
		@Schema(description = "멤버십 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e7f",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID id,

		@Schema(description = "공개 회원 정보", requiredMode = Schema.RequiredMode.REQUIRED)
		UserCard user,

		@Schema(description = "역할", example = "OWNER", requiredMode = Schema.RequiredMode.REQUIRED)
		TripMemberRole role,

		@Schema(description = "멤버십 상태", example = "ACTIVE", requiredMode = Schema.RequiredMode.REQUIRED)
		TripMemberStatus status,

		@Schema(description = "여행별 참여 순번. 방장 자동 양도 기준", example = "1",
				requiredMode = Schema.RequiredMode.REQUIRED)
		long joinOrder,

		@Schema(description = "참여 시각(UTC)", example = "2026-10-28T06:00:00Z",
				requiredMode = Schema.RequiredMode.REQUIRED)
		Instant joinedAt,

		@Schema(description = "이탈 시각(UTC). 활성 멤버면 null", requiredMode = Schema.RequiredMode.REQUIRED,
				nullable = true)
		Instant leftAt
) {

	public static TripMemberResponse of(TripMember member, UserCard user, UUID ownerUserId) {
		TripMemberRole role = member.getUserId().equals(ownerUserId) ? TripMemberRole.OWNER : TripMemberRole.MEMBER;
		return new TripMemberResponse(member.getId(), user, role, member.getStatus(), member.getJoinOrder(),
				member.getJoinedAt(), member.getLeftAt());
	}

}
