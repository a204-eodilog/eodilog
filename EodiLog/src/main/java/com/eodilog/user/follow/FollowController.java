package com.eodilog.user.follow;

import com.eodilog.global.common.response.DataResponse;
import com.eodilog.global.common.response.PageResponse;
import com.eodilog.global.security.AuthUser;
import com.eodilog.user.follow.FollowService.ListKind;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@Tag(name = "팔로우", description = "방향별 팔로우·요청·수락·해제")
public class FollowController {

	public enum RequestDirection { RECEIVED, SENT }

	private final FollowService service;

	public FollowController(FollowService service) {
		this.service = service;
	}

	@PostMapping("/users/{userId}/follow")
	@Operation(summary = "팔로우",
			description = "로그인. 대상이 PUBLIC이면 바로 ACCEPTED, PRIVATE면 REQUESTED(대상에게 FOLLOW_REQUESTED 알림). 같은 방향이 이미 있으면 그 관계를 그대로 반환한다. 반대 방향 관계·공동 여행에는 영향이 없다")
	@ApiResponse(responseCode = "200", description = "팔로우 또는 요청 상태")
	@ApiResponse(responseCode = "400", description = "CANNOT_FOLLOW_SELF: 자기 자신")
	@ApiResponse(responseCode = "404", description = "USER_NOT_FOUND: 없는·탈퇴·가입 대기 회원")
	public DataResponse<FollowResponse> follow(@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user,
			@Parameter(description = "대상 사용자 ID") @PathVariable UUID userId) {
		return DataResponse.of(service.follow(user.userId(), userId));
	}

	@DeleteMapping("/users/{userId}/follow")
	@Operation(summary = "언팔로우·요청 취소",
			description = "팔로우 발신자. 내가 보낸 방향(REQUESTED·ACCEPTED)을 지운다. 관계가 없어도 204. 반대 방향과 공동 여행은 유지한다")
	@ApiResponse(responseCode = "204", description = "해제됨")
	public ResponseEntity<Void> unfollow(@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user,
			@Parameter(description = "대상 사용자 ID") @PathVariable UUID userId) {
		service.unfollow(user.userId(), userId);
		return ResponseEntity.noContent().build();
	}

	@GetMapping("/me/following")
	@Operation(summary = "내 팔로잉 목록", description = "본인. 내가 팔로우한 ACCEPTED 방향만, 수락 시각 최신순. 탈퇴·가입 대기 회원 제외. limit 1~100")
	public PageResponse<FollowResponse> following(@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user,
			@RequestParam(required = false) String cursor, @RequestParam(defaultValue = "20") int limit) {
		return service.list(user.userId(), ListKind.FOLLOWING, cursor, limit);
	}

	@GetMapping("/me/followers")
	@Operation(summary = "내 팔로워 목록", description = "본인. 나를 팔로우한 ACCEPTED 방향만, 수락 시각 최신순. 탈퇴·가입 대기 회원 제외. limit 1~100")
	public PageResponse<FollowResponse> followers(@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user,
			@RequestParam(required = false) String cursor, @RequestParam(defaultValue = "20") int limit) {
		return service.list(user.userId(), ListKind.FOLLOWERS, cursor, limit);
	}

	@GetMapping("/me/follow-requests")
	@Operation(summary = "팔로우 요청 목록", description = "본인. REQUESTED만, 요청 시각 최신순. RECEIVED는 받은 요청, SENT는 보낸 요청. 탈퇴·가입 대기 회원 제외. limit 1~100")
	public PageResponse<FollowResponse> requests(@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user,
			@Parameter(description = "RECEIVED 또는 SENT") @RequestParam RequestDirection direction,
			@RequestParam(required = false) String cursor, @RequestParam(defaultValue = "20") int limit) {
		return service.list(user.userId(), direction == RequestDirection.RECEIVED ? ListKind.RECEIVED : ListKind.SENT,
				cursor, limit);
	}

	@PostMapping("/me/follow-requests/{requestId}/accept")
	@Operation(summary = "팔로우 요청 수락", description = "대상 계정 본인. REQUESTED→ACCEPTED, 요청자에게 FOLLOW_ACCEPTED 알림. 이미 수락한 요청은 그대로 반환. 반대 방향은 만들지 않는다")
	@ApiResponse(responseCode = "200", description = "수락된 관계")
	@ApiResponse(responseCode = "404", description = "FOLLOW_REQUEST_NOT_FOUND: 없는 요청·내가 받은 요청이 아님·요청자 탈퇴")
	public DataResponse<FollowResponse> accept(@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user,
			@Parameter(description = "요청 ID(Follow.id)") @PathVariable UUID requestId) {
		return DataResponse.of(service.accept(user.userId(), requestId));
	}

	@DeleteMapping("/me/follow-requests/{requestId}")
	@Operation(summary = "팔로우 요청 취소·거절", description = "당사자. 보낸 사람은 취소, 받은 사람은 거절. REQUESTED만 지운다")
	@ApiResponse(responseCode = "204", description = "삭제됨")
	@ApiResponse(responseCode = "404", description = "FOLLOW_REQUEST_NOT_FOUND: 없는 요청·이미 수락됨·당사자 아님")
	public ResponseEntity<Void> deleteRequest(@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user,
			@Parameter(description = "요청 ID(Follow.id)") @PathVariable UUID requestId) {
		service.deleteRequest(user.userId(), requestId);
		return ResponseEntity.noContent().build();
	}

	@DeleteMapping("/me/followers/{userId}")
	@Operation(summary = "팔로워 제거", description = "대상 계정 본인. 나를 팔로우한 ACCEPTED 관계를 지운다. 없어도 204. 반대 방향은 유지한다")
	@ApiResponse(responseCode = "204", description = "제거됨")
	public ResponseEntity<Void> removeFollower(@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user,
			@Parameter(description = "제거할 팔로워 사용자 ID") @PathVariable UUID userId) {
		service.removeFollower(user.userId(), userId);
		return ResponseEntity.noContent().build();
	}

}
