package com.eodilog.checklist.controller;

import com.eodilog.checklist.dto.ChecklistItemResponse;
import com.eodilog.checklist.dto.ChecklistResponse;
import com.eodilog.checklist.dto.CreateChecklistItemRequest;
import com.eodilog.checklist.dto.UpdateChecklistItemRequest;
import com.eodilog.checklist.service.ChecklistService;
import com.eodilog.global.common.error.ErrorResponse;
import com.eodilog.global.common.response.DataResponse;
import com.eodilog.global.security.AuthUser;
import com.eodilog.trip.controller.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "준비물", description = "여행 공동 준비물 조회·추가·수정·체크·삭제")
@RestController
@RequestMapping("/api/v1/trips/{tripId}/checklist")
@RequiredArgsConstructor
public class ChecklistController {

	private final ChecklistService checklistService;

	@Operation(summary = "준비물 목록 조회", description = """
			여행의 ACTIVE 멤버만 조회한다. 여행마다 공동 목록 하나이며 페이지 없이 추가한 순으로 전부 반환한다.
			없는 여행·참여하지 않았거나 나간 여행은 구분하지 않고 404로 응답한다.""")
	@ApiResponse(responseCode = "200", description = "조회 성공")
	@ApiResponse(responseCode = "404", description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@GetMapping
	public ResponseEntity<DataResponse<ChecklistResponse>> getChecklist(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId) {
		ChecklistResponse checklist = checklistService.getChecklist(CurrentUser.requireUserId(authUser), tripId);
		return ResponseEntity.ok(DataResponse.of(checklist));
	}

	@Operation(summary = "준비물 추가·AI 제안 채택", description = """
			여행의 ACTIVE 멤버라면 누구나 준비물을 추가한다. 체크하지 않은 상태로 만들어진다.
			sourceJobId·suggestionIndex를 함께 보내면 AI 준비물 제안을 채택한다(source=AI, 제안 이유 보존).
			같은 여행의 성공한 CHECKLIST_SUGGESTIONS 작업과 결과 items 안의 순번(0부터)만 받는다. 아니면 400.
			label은 제안 이름을 그대로 보내거나 고쳐 보낸다. 고치면 modifiedByUser=true.
			같은 제안은 한 번만 채택하며, 채택 후 지운 제안도 다시 채택할 수 없다(409).""")
	@ApiResponse(responseCode = "201", description = "추가 성공")
	@ApiResponse(responseCode = "404", description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409", description = """
			AI_FEATURE_DISABLED: 내 준비물 추천 설정이 OFF / SUGGESTION_ALREADY_ADOPTED: 이미 채택한 제안""",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@PostMapping
	public ResponseEntity<DataResponse<ChecklistItemResponse>> addItem(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId,
			@RequestBody CreateChecklistItemRequest request) {
		ChecklistItemResponse item = checklistService.addItem(CurrentUser.requireUserId(authUser), tripId, request);
		return ResponseEntity.status(HttpStatus.CREATED).body(DataResponse.of(item));
	}

	@Operation(summary = "준비물 수정·체크", description = """
			여행의 ACTIVE 멤버라면 누구나 이름을 고치거나 체크·해제한다. 생략한 필드는 그대로 둔다.
			체크하면 서버가 요청한 멤버와 시각을 기록하고, 해제하면 둘 다 비운다. 체크한 사람을 요청으로 지정할 수 없다.
			expectedVersion이 현재 version과 다르면 다른 멤버의 변경을 덮어쓰지 않고 409로 거부한다.
			바뀐 값이 없으면 version을 올리지 않고 현재 값을 반환한다.""")
	@ApiResponse(responseCode = "200", description = "수정 성공(또는 바뀐 값 없음)")
	@ApiResponse(responseCode = "404",
			description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행 / CHECKLIST_ITEM_NOT_FOUND: 없거나 삭제된 준비물",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409", description = "VERSION_CONFLICT: 다른 멤버가 먼저 수정함. 다시 조회 후 시도",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@PatchMapping("/{itemId}")
	public ResponseEntity<DataResponse<ChecklistItemResponse>> updateItem(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId,
			@Parameter(description = "준비물 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e81")
			@PathVariable UUID itemId,
			@RequestBody UpdateChecklistItemRequest request) {
		ChecklistItemResponse item = checklistService.updateItem(
				CurrentUser.requireUserId(authUser), tripId, itemId, request);
		return ResponseEntity.ok(DataResponse.of(item));
	}

	@Operation(summary = "준비물 삭제", description = """
			여행의 ACTIVE 멤버라면 누구나 삭제한다. 이후 AI 준비물 제안이 와도 삭제한 항목을 되살리지 않는다.""")
	@ApiResponse(responseCode = "204", description = "삭제 성공")
	@ApiResponse(responseCode = "404",
			description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행 / CHECKLIST_ITEM_NOT_FOUND: 없거나 이미 삭제된 준비물",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@DeleteMapping("/{itemId}")
	public ResponseEntity<Void> deleteItem(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId,
			@Parameter(description = "준비물 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e81")
			@PathVariable UUID itemId) {
		checklistService.deleteItem(CurrentUser.requireUserId(authUser), tripId, itemId);
		return ResponseEntity.noContent().build();
	}

}
