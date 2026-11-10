package com.eodilog.user.follow;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.eodilog.user.dto.FollowStatus;
import com.eodilog.user.dto.UserCard;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.UUID;

// 명세 §10 Follow. 한 방향의 관계 하나다
@Schema(name = "Follow", description = "한 방향의 팔로우 관계. 반대 방향은 별도 관계다")
public record FollowResponse(
		@Schema(description = "관계 ID. 받은·보낸 요청의 requestId로도 쓴다", example = "0196f1d2-7c3a-7b2e-9a41-5c2d8e0b7c45", requiredMode = REQUIRED)
		UUID id,
		@Schema(description = "팔로우하는 사람", requiredMode = REQUIRED)
		UserCard follower,
		@Schema(description = "팔로우받는 사람", requiredMode = REQUIRED)
		UserCard followee,
		@Schema(description = "관계 상태", allowableValues = {"REQUESTED", "ACCEPTED"}, example = "ACCEPTED", requiredMode = REQUIRED)
		FollowStatus status,
		@Schema(description = "요청 시각(UTC)", example = "2026-11-10T01:00:00Z", requiredMode = REQUIRED)
		Instant requestedAt,
		@Schema(description = "수락 시각(UTC), REQUESTED면 null", example = "2026-11-10T01:05:00Z", nullable = true, requiredMode = REQUIRED)
		Instant acceptedAt
) {
}
