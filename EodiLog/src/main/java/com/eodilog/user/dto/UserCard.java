package com.eodilog.user.dto;

import java.util.UUID;
import io.swagger.v3.oas.annotations.media.Schema;
import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

public record UserCard(
		@Schema(description = "사용자 ID", example = "3f2b8c1e-5d4a-4e7b-9c1f-2a6d8e0b7c45", requiredMode = REQUIRED) UUID id,
		@Schema(description = "닉네임", requiredMode = REQUIRED) String nickname,
		@Schema(description = "프로필 이미지 URL, 없으면 null", nullable = true, requiredMode = REQUIRED) String profileImageUrl,
		@Schema(description = "계정 공개 범위", requiredMode = REQUIRED) AccountVisibility accountVisibility,
		@Schema(description = "팔로우 상태", requiredMode = REQUIRED) FollowStatus followingStatus,
		@Schema(description = "역방향 팔로우 상태", requiredMode = REQUIRED) FollowStatus followedByStatus
) {
}
