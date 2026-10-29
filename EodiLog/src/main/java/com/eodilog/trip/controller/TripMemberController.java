package com.eodilog.trip.controller;

import com.eodilog.global.common.error.ErrorResponse;
import com.eodilog.global.common.response.DataResponse;
import com.eodilog.global.security.AuthUser;
import com.eodilog.trip.dto.OwnerTransferRequest;
import com.eodilog.trip.dto.TripMembersResponse;
import com.eodilog.trip.dto.TripResponse;
import com.eodilog.trip.service.TripMemberService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "여행", description = "여행 생성·조회·수정과 멤버 관리")
@RestController
@RequestMapping("/api/v1/trips/{tripId}")
@RequiredArgsConstructor
public class TripMemberController {

	private final TripMemberService tripMemberService;

	@Operation(summary = "멤버 목록 조회", description = """
			여행의 ACTIVE 멤버만 조회한다. 참여 순(joinOrder)으로 반환하며 role은 현재 방장과 비교해 계산한다.
			기본은 ACTIVE 멤버만 담고, includeInactive=true면 정산에 남는 나간(LEFT)·내보낸(REMOVED) 멤버도 담는다.
			없는 여행·참여하지 않았거나 나간 여행은 구분하지 않고 404로 응답한다.""")
	@ApiResponse(responseCode = "200", description = "조회 성공")
	@ApiResponse(responseCode = "404", description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@GetMapping("/members")
	public ResponseEntity<DataResponse<TripMembersResponse>> getMembers(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId,
			@Parameter(description = "나간·내보낸 멤버 포함 여부", example = "false")
			@RequestParam(defaultValue = "false") boolean includeInactive) {
		TripMembersResponse members = tripMemberService.getMembers(
				CurrentUser.requireUserId(authUser), tripId, includeInactive);
		return ResponseEntity.ok(DataResponse.of(members));
	}

	@Operation(summary = "방장 넘기기", description = """
			방장만 같은 여행의 ACTIVE 동행에게 방장을 넘긴다. 넘긴 뒤 내보내기·방장 넘기기는 새 방장만 할 수 있다.
			expectedVersion은 여행 version이며, 다르면 다른 변경을 덮어쓰지 않고 409로 거부한다. 성공하면 version이 하나 오른다.
			방장 넘기기 알림은 보내지 않는다.""")
	@ApiResponse(responseCode = "200", description = "넘기기 성공. 바뀐 여행 정보를 반환")
	@ApiResponse(responseCode = "403", description = "FORBIDDEN: 방장이 아닌 동행",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "404", description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409", description = "VERSION_CONFLICT: 여행이 그 사이 바뀜. 다시 조회 후 시도",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@PostMapping("/owner-transfer")
	public ResponseEntity<DataResponse<TripResponse>> transferOwner(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId,
			@RequestBody OwnerTransferRequest request) {
		TripResponse trip = tripMemberService.transferOwner(CurrentUser.requireUserId(authUser), tripId, request);
		return ResponseEntity.ok(DataResponse.of(trip));
	}

	@Operation(summary = "동행 내보내기", description = """
			방장만 다른 ACTIVE 동행을 내보낸다. 방장 본인은 내보낼 수 없다(나가기를 사용).
			내보낸 멤버는 REMOVED가 되어 여행 내부 자료에 접근할 수 없고 그룹 채팅 참여도 끝난다. 멤버십 기록은 지우지 않는다.
			expectedVersion은 여행 version이며, 다르면 409로 거부한다. 성공하면 version이 하나 오른다.""")
	@ApiResponse(responseCode = "204", description = "내보내기 성공")
	@ApiResponse(responseCode = "403", description = "FORBIDDEN: 방장이 아닌 동행",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "404",
			description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행 / MEMBER_NOT_FOUND: 없거나 이미 나간 동행",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409", description = "VERSION_CONFLICT: 여행이 그 사이 바뀜. 다시 조회 후 시도",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@DeleteMapping("/members/{memberId}")
	public ResponseEntity<Void> removeMember(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId,
			@Parameter(description = "내보낼 멤버십 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e80")
			@PathVariable UUID memberId,
			@Parameter(description = "조회한 여행의 version", required = true, example = "1")
			@RequestParam(required = false) Long expectedVersion) {
		tripMemberService.removeMember(CurrentUser.requireUserId(authUser), tripId, memberId, expectedVersion);
		return ResponseEntity.noContent().build();
	}

}
