package com.eodilog.invitation.controller;

import com.eodilog.global.common.error.ErrorResponse;
import com.eodilog.global.common.response.DataResponse;
import com.eodilog.global.security.AuthUser;
import com.eodilog.invitation.dto.InvitableFriendsResponse;
import com.eodilog.invitation.dto.ReceivedTripInvitationResponse;
import com.eodilog.invitation.dto.SendFriendInvitationsRequest;
import com.eodilog.invitation.dto.SendFriendInvitationsResponse;
import com.eodilog.invitation.service.FriendInvitationService;
import com.eodilog.trip.controller.CurrentUser;
import com.eodilog.trip.dto.TripResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "초대", description = "여행 초대 링크 생성·취소·미리보기·수락, 맞팔 친구 앱 내 초대")
@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class FriendInvitationController {

	private final FriendInvitationService service;

	@Operation(summary = "초대할 수 있는 맞팔 친구 목록", description = """
			멤버. 나와 서로 팔로우(두 방향 모두 ACCEPTED)한 회원을 이 여행 기준 상태와 함께 준다.
			INVITABLE(초대 가능) → INVITED(대기 중인 초대 있음, invitationId 포함) → MEMBER(이미 동행) 순, 같은 묶음은 닉네임 순.
			페이지 없이 최대 500명이며 넘으면 truncated=true다.""")
	@ApiResponse(responseCode = "200", description = "조회 성공")
	@ApiResponse(responseCode = "404", description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@GetMapping("/trips/{tripId}/invitable-friends")
	public DataResponse<InvitableFriendsResponse> invitableFriends(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)") @PathVariable UUID tripId) {
		return DataResponse.of(service.invitableFriends(CurrentUser.requireUserId(authUser), tripId));
	}

	@Operation(summary = "맞팔 친구에게 앱 내 초대 보내기", description = """
			멤버 누구나. 1~19명에게 한 번에 보낸다(중복은 하나로, 자기 자신 포함 시 400).
			사람마다 결과가 다르다: SENT(새로 보냄, 받은 사람에게 TRIP_INVITED 알림), ALREADY_INVITED(대기 중인 초대가 있어 그대로, 알림 없음),
			ALREADY_MEMBER(이미 동행), NOT_MUTUAL(맞팔이 아니거나 없는 회원). 초대는 7일 뒤 만료된다.
			여행 ACTIVE 멤버가 이미 20명이면 409 TRIP_FULL. 여행 version은 바뀌지 않는다.""")
	@ApiResponse(responseCode = "200", description = "사람별 결과")
	@ApiResponse(responseCode = "404", description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409", description = "TRIP_FULL: 여행 인원(20명)이 가득 참",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@PostMapping("/trips/{tripId}/friend-invitations")
	public DataResponse<SendFriendInvitationsResponse> send(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)") @PathVariable UUID tripId,
			@RequestBody SendFriendInvitationsRequest request) {
		return DataResponse.of(service.send(CurrentUser.requireUserId(authUser), tripId, request.inviteeUserIds()));
	}

	@Operation(summary = "보낸 앱 내 초대 취소", description = """
			멤버 누구나. 대기 중인 초대를 취소한다. 이미 처리됐거나 없는 초대면 바뀌는 것 없이 204다.
			받은 사람의 알림은 남고, 눌러 들어가면 CANCELED 상태로 보인다.""")
	@ApiResponse(responseCode = "204", description = "취소됨 또는 취소할 초대 없음")
	@ApiResponse(responseCode = "404", description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@DeleteMapping("/trips/{tripId}/friend-invitations/{invitationId}")
	public ResponseEntity<Void> cancel(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)") @PathVariable UUID tripId,
			@Parameter(description = "초대 ID(UUID)") @PathVariable UUID invitationId) {
		service.cancel(CurrentUser.requireUserId(authUser), tripId, invitationId);
		return ResponseEntity.noContent().build();
	}

	@Operation(summary = "받은 여행 초대 목록", description = """
			본인. 지금 수락할 수 있는 초대만 최신순으로 준다. 기간이 지났거나, 여행이 삭제됐거나, 초대한 사람이 여행을 나간 초대는 뺀다.
			여행 이름·기간·인원·초대한 사람만 담고 동행 명단·경비는 담지 않는다.""")
	@ApiResponse(responseCode = "200", description = "조회 성공")
	@GetMapping("/me/trip-invitations")
	public DataResponse<List<ReceivedTripInvitationResponse>> received(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser) {
		return DataResponse.of(service.received(CurrentUser.requireUserId(authUser)));
	}

	@Operation(summary = "받은 여행 초대 한 건", description = """
			받은 사람 본인. 알림(TRIP_INVITED, target TRIP_INVITATION)에서 들어올 때 쓴다.
			쓸 수 없게 된 초대도 410 대신 status(EXPIRED·ACCEPTED·DECLINED·CANCELED)로 알려 준다. 이미 동행이면 alreadyMember=true.""")
	@ApiResponse(responseCode = "200", description = "조회 성공")
	@ApiResponse(responseCode = "404", description = "FRIEND_INVITATION_NOT_FOUND: 없거나 내가 받은 초대가 아님",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@GetMapping("/me/trip-invitations/{invitationId}")
	public DataResponse<ReceivedTripInvitationResponse> get(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "초대 ID(UUID)") @PathVariable UUID invitationId) {
		return DataResponse.of(service.get(CurrentUser.requireUserId(authUser), invitationId));
	}

	@Operation(summary = "받은 여행 초대 수락", description = """
			받은 사람 본인. 링크 수락과 같이 여행에 참여한다(정원 20명, 그룹 채팅 참여, 여행 version 증가, 기존 멤버에게 TRIP_MEMBER_JOINED 알림).
			이미 동행이면 바뀌는 것 없이 같은 여행을 반환한다. 나갔거나 내보내진 사람은 기존 멤버십을 다시 쓰고 참여 순번은 맨 뒤로 받는다.
			보낸 뒤 언팔했어도 수락할 수 있다(맞팔은 보낼 때만 확인).""")
	@ApiResponse(responseCode = "200", description = "참여 성공 또는 이미 참여 중. 여행 정보를 반환")
	@ApiResponse(responseCode = "404", description = "FRIEND_INVITATION_NOT_FOUND: 없거나 내가 받은 초대가 아님",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409", description = "TRIP_FULL: 여행 인원(20명)이 가득 참",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "410",
			description = "INVITATION_REVOKED: 취소·거절·이미 처리된 초대 / INVITATION_EXPIRED: 기간 지남, 삭제된 여행, 초대한 사람이 여행을 나감",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@PostMapping("/me/trip-invitations/{invitationId}/accept")
	public DataResponse<TripResponse> accept(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "초대 ID(UUID)") @PathVariable UUID invitationId) {
		return DataResponse.of(service.accept(CurrentUser.requireUserId(authUser), invitationId));
	}

	@Operation(summary = "받은 여행 초대 거절", description = """
			받은 사람 본인. 대기 중인 초대를 거절한다. 이미 거절했으면 204. 보낸 사람에게 알리지 않는다.""")
	@ApiResponse(responseCode = "204", description = "거절됨")
	@ApiResponse(responseCode = "404", description = "FRIEND_INVITATION_NOT_FOUND: 없거나 내가 받은 초대가 아니거나 이미 수락·취소됨",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@PostMapping("/me/trip-invitations/{invitationId}/decline")
	public ResponseEntity<Void> decline(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "초대 ID(UUID)") @PathVariable UUID invitationId) {
		service.decline(CurrentUser.requireUserId(authUser), invitationId);
		return ResponseEntity.noContent().build();
	}

}
