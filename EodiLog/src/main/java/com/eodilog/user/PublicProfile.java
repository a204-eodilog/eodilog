package com.eodilog.user;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.eodilog.user.dto.AccountVisibility;
import com.eodilog.user.dto.FollowStatus;
import com.eodilog.user.dto.UserCard;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

// GET /users/{userId}. UserCard에 팔로워·팔로잉 수를 더한다. 연령·이메일·동의 정보는 넣지 않는다.
// 수는 비공개 계정도 보여 주며 상대가 활동 중·가입 완료인 ACCEPTED 관계만 센다. 공동 피드 수는 피드 담당이 따로 제공한다
@Schema(description = "다른 사용자 프로필. UserCard 필드 + 팔로워·팔로잉 수")
public record PublicProfile(
		@Schema(description = "사용자 ID", example = "3f2b8c1e-5d4a-4e7b-9c1f-2a6d8e0b7c45", requiredMode = REQUIRED) UUID id,
		@Schema(description = "닉네임", example = "여행자", requiredMode = REQUIRED) String nickname,
		@Schema(description = "프로필 사진 URL(/api/v1 뒤 경로), 없으면 null", example = "/assets/0196f1d2-7c3a-7b2e-9a41-5c2d8e0b7c45/download", nullable = true, requiredMode = REQUIRED) String profileImageUrl,
		@Schema(description = "계정 공개 범위", requiredMode = REQUIRED) AccountVisibility accountVisibility,
		@Schema(description = "내가 이 사람을 팔로우한 상태", requiredMode = REQUIRED) FollowStatus followingStatus,
		@Schema(description = "이 사람이 나를 팔로우한 상태", requiredMode = REQUIRED) FollowStatus followedByStatus,
		@Schema(description = "팔로워 수(ACCEPTED)", example = "12", requiredMode = REQUIRED) long followerCount,
		@Schema(description = "팔로잉 수(ACCEPTED)", example = "8", requiredMode = REQUIRED) long followingCount
) {

	static PublicProfile of(UserCard card, long followerCount, long followingCount) {
		return new PublicProfile(card.id(), card.nickname(), card.profileImageUrl(), card.accountVisibility(),
				card.followingStatus(), card.followedByStatus(), followerCount, followingCount);
	}

}
