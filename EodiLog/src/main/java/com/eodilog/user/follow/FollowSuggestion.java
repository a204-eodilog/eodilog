package com.eodilog.user.follow;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.eodilog.user.dto.UserCard;
import io.swagger.v3.oas.annotations.media.Schema;

// 친구 추천 한 명(명세 §3 GET /me/follow-suggestions). 이유는 공개해도 되는 것만 담는다
@Schema(description = "친구 추천 한 명")
public record FollowSuggestion(
		@Schema(description = "추천 회원", requiredMode = REQUIRED) UserCard user,
		@Schema(description = "추천 이유", requiredMode = REQUIRED) Reason reason
) {

	public enum Kind {
		// 같은 여행을 함께한 사람(현재 멤버이거나 나간 멤버, 삭제된 여행 제외)
		CO_TRAVELER,
		// 나를 팔로우하는데 내가 팔로우하지 않은 사람
		FOLLOWS_YOU
	}

	@Schema(description = "추천 이유. CO_TRAVELER면 count가 함께한 여행 수이고, FOLLOWS_YOU면 count가 없다. 화면 문구는 FE가 붙인다")
	@JsonInclude(JsonInclude.Include.NON_NULL)
	public record Reason(
			@Schema(description = "이유 종류", example = "CO_TRAVELER", requiredMode = REQUIRED) Kind kind,
			@Schema(description = "함께한 여행 수(CO_TRAVELER만)", example = "2", nullable = true) Integer count
	) {
	}

}
