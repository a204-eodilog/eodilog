package com.eodilog.invitation.controller;

import com.eodilog.global.common.error.ErrorResponse;
import com.eodilog.global.common.response.DataResponse;
import com.eodilog.global.security.AuthUser;
import com.eodilog.invitation.dto.InvitationPreviewResponse;
import com.eodilog.invitation.dto.InvitationSecretResponse;
import com.eodilog.invitation.service.InvitationService;
import com.eodilog.trip.controller.CurrentUser;
import com.eodilog.trip.dto.TripResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "초대", description = "여행 초대 링크 생성·미리보기·수락")
@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class InvitationController {

	private final InvitationService invitationService;

	@Operation(summary = "초대 링크 생성", description = """
			여행의 ACTIVE 멤버라면 누구나 만든다. 링크는 7일 뒤 만료되며 만료 전에는 여러 명이 쓸 수 있다.
			토큰 원문은 이 응답에서만 반환하고 서버는 해시만 보관한다. 초대 코드는 없다.""")
	@ApiResponse(responseCode = "201", description = "생성 성공")
	@ApiResponse(responseCode = "404", description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@PostMapping("/trips/{tripId}/invitations")
	public ResponseEntity<DataResponse<InvitationSecretResponse>> createInvitation(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId) {
		InvitationSecretResponse invitation = invitationService.createInvitation(
				CurrentUser.requireUserId(authUser), tripId);
		return ResponseEntity.status(HttpStatus.CREATED).body(DataResponse.of(invitation));
	}

	@Operation(summary = "초대 미리보기", description = """
			토큰 없이 조회한다. 여행 이름·기간·초대한 사람·만료 시각만 반환하고 동행 명단과 경비는 담지 않는다.
			로그인한 상태로 조회하면 inviterUser에 초대한 사람의 회원 카드를 담고, 로그인하지 않으면 null이다.
			Authorization 헤더를 보내면 검증하므로, 만료된 토큰을 보내면 401이다.""")
	@SecurityRequirements
	@ApiResponse(responseCode = "200", description = "조회 성공")
	@ApiResponse(responseCode = "404", description = "NOT_FOUND: 초대 토큰 형식이 아님",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "410",
			description = "INVITATION_EXPIRED: 없거나 만료된 링크, 삭제된 여행, 초대한 사람이 여행을 나간 링크",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@GetMapping("/invitations/{token}")
	public ResponseEntity<DataResponse<InvitationPreviewResponse>> getInvitation(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "초대 토큰(43자)") @PathVariable String token) {
		InvitationPreviewResponse preview = invitationService.getPreview(
				authUser == null ? null : authUser.userId(), token);
		return ResponseEntity.ok(DataResponse.of(preview));
	}

	@Operation(summary = "초대 수락", description = """
			팔로우 관계와 상관없이 유효한 링크로 여행에 참여한다. 이미 ACTIVE 멤버면 바뀌는 것 없이 같은 여행을 반환한다.
			나갔거나 내보내진 사람도 다시 참여할 수 있으며, 기존 멤버십을 다시 쓰고 참여 순번은 맨 뒤로 받는다.
			여행의 ACTIVE 멤버는 방장 포함 20명까지다. 참여하면 그룹 채팅에도 들어가고 여행 version이 하나 오른다.""")
	@ApiResponse(responseCode = "200", description = "참여 성공 또는 이미 참여 중. 여행 정보를 반환")
	@ApiResponse(responseCode = "404", description = "NOT_FOUND: 초대 토큰 형식이 아님",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409", description = "TRIP_FULL: 여행 인원(20명)이 가득 참",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "410",
			description = "INVITATION_EXPIRED: 없거나 만료된 링크, 삭제된 여행, 초대한 사람이 여행을 나간 링크",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@PostMapping("/invitations/{token}/accept")
	public ResponseEntity<DataResponse<TripResponse>> acceptInvitation(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "초대 토큰(43자)") @PathVariable String token) {
		TripResponse trip = invitationService.acceptInvitation(CurrentUser.requireUserId(authUser), token);
		return ResponseEntity.ok(DataResponse.of(trip));
	}

}
