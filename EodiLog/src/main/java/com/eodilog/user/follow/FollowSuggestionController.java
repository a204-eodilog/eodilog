package com.eodilog.user.follow;

import com.eodilog.global.common.response.PageResponse;
import com.eodilog.global.security.AuthUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/me")
@Tag(name = "친구 추천", description = "팔로우할 사람 추천과 추천 숨김")
public class FollowSuggestionController {

	private final FollowSuggestionService service;

	public FollowSuggestionController(FollowSuggestionService service) {
		this.service = service;
	}

	@GetMapping("/follow-suggestions")
	@Operation(summary = "친구 추천 목록",
			description = "본인. 함께 여행한 사람(reason CO_TRAVELER, count=함께한 여행 수)과 나를 팔로우하는데 내가 팔로우하지 않은 사람(FOLLOWS_YOU). 본인·탈퇴·가입 대기·이미 팔로우하거나 요청한 사람·숨긴 사람 제외. 함께 여행한 사람 먼저(여행 수 많은 순). limit 1~50")
	public PageResponse<FollowSuggestion> list(@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user,
			@RequestParam(required = false) String cursor, @RequestParam(defaultValue = "20") int limit) {
		return service.list(user.userId(), cursor, limit);
	}

	@PutMapping("/follow-suggestion-dismissals/{userId}")
	@Operation(summary = "추천에서 숨기기",
			description = "본인. 영구히 다시 추천하지 않는다(만료 없음). 다시 숨겨도 204. 검색·팔로우·기존 관계에는 영향이 없다")
	@ApiResponse(responseCode = "204", description = "숨김")
	@ApiResponse(responseCode = "404", description = "USER_NOT_FOUND: 없는·탈퇴·가입 대기 회원")
	public ResponseEntity<Void> dismiss(@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user,
			@Parameter(description = "숨길 사용자 ID") @PathVariable UUID userId) {
		service.dismiss(user.userId(), userId);
		return ResponseEntity.noContent().build();
	}

}
