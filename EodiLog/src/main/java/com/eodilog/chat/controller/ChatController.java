package com.eodilog.chat.controller;

import com.eodilog.chat.dto.ChatRoomResponse;
import com.eodilog.chat.dto.MessagePageResponse;
import com.eodilog.chat.dto.MessageResponse;
import com.eodilog.chat.dto.SendMessageRequest;
import com.eodilog.chat.service.ChatService;
import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import com.eodilog.global.common.response.DataResponse;
import com.eodilog.global.common.response.PageResponse;
import com.eodilog.global.security.AuthUser;
import com.eodilog.trip.controller.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "채팅", description = "여행 그룹 채팅방·메시지 조회와 전송(REST)")
@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class ChatController {

	private final ChatService chatService;

	@Operation(summary = "내 채팅방 목록", description = """
			지금 ACTIVE 멤버인 여행의 그룹 채팅방만 반환한다. 나갔거나 내보내진 여행, 삭제된 여행의 방은 나오지 않는다.
			방이 만들어진 순서의 역순(createdAt DESC, id DESC) 커서 페이지다.""")
	@ApiResponse(responseCode = "200", description = "조회 성공")
	@GetMapping("/chat/rooms")
	public ResponseEntity<PageResponse<ChatRoomResponse>> getRooms(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "이전 응답의 page.nextCursor. 첫 페이지는 생략")
			@RequestParam(required = false) String cursor,
			@Parameter(description = "페이지 크기(1~100)", example = "20")
			@RequestParam(defaultValue = "" + ChatService.DEFAULT_LIMIT)
			@Min(1) @Max(ChatService.MAX_LIMIT) int limit) {
		return ResponseEntity.ok(chatService.getRooms(CurrentUser.requireUserId(authUser), cursor, limit));
	}

	@Operation(summary = "여행 채팅방 조회", description = """
			여행의 ACTIVE 멤버만 조회한다. 여행당 그룹 채팅방은 하나이며 여행을 만들 때 함께 생긴다.
			participants는 지금 참여 중인 동행(참여 순), lastMessage는 가장 최근 메시지(없으면 null)다.""")
	@ApiResponse(responseCode = "200", description = "조회 성공")
	@ApiResponse(responseCode = "404", description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@GetMapping("/trips/{tripId}/chat-room")
	public ResponseEntity<DataResponse<ChatRoomResponse>> getTripRoom(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId) {
		return ResponseEntity.ok(DataResponse.of(chatService.getTripRoom(CurrentUser.requireUserId(authUser), tripId)));
	}

	@Operation(summary = "메시지 목록", description = """
			방에 참여 중인 ACTIVE 멤버만 조회한다. 새로 들어왔거나 다시 들어온 멤버도 처음부터 전체 대화를 본다.
			sequence 내림차순이며 beforeSequence보다 작은 메시지만 준다(경계값 미포함). 응답은 공통 cursor 페이지가 아니라
			page.nextBeforeSequence(이 페이지의 최소 sequence, 더 없으면 null)·hasNext이며, 공통 cursor 파라미터를 보내면 400이다.""")
	@ApiResponse(responseCode = "200", description = "조회 성공")
	@ApiResponse(responseCode = "404", description = "CHAT_ROOM_NOT_FOUND: 없거나 참여하지 않은(나간) 방",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@GetMapping("/chat/rooms/{roomId}/messages")
	public ResponseEntity<MessagePageResponse> getMessages(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "채팅방 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e71")
			@PathVariable UUID roomId,
			@Parameter(hidden = true) @RequestParam(required = false) String cursor,
			@Parameter(description = "이 순번보다 앞선 메시지만. 첫 페이지는 생략", example = "21")
			@RequestParam(required = false) @Min(1) Long beforeSequence,
			@Parameter(description = "페이지 크기(1~100)", example = "20")
			@RequestParam(defaultValue = "" + ChatService.DEFAULT_LIMIT)
			@Min(1) @Max(ChatService.MAX_LIMIT) int limit) {
		// 명세 §9: 메시지 목록은 sequence 전용 규칙이라 공통 cursor와 섞으면 400
		if (cursor != null) {
			throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
					List.of(new ErrorField("cursor", "메시지 목록은 cursor 대신 beforeSequence를 씁니다.")));
		}
		return ResponseEntity.ok(
				chatService.getMessages(CurrentUser.requireUserId(authUser), roomId, beforeSequence, limit));
	}

	@Operation(summary = "메시지 전송", description = """
			방에 참여 중인 ACTIVE 멤버만 보낸다. clientMessageId가 재전송 판별 키라서 Idempotency-Key 헤더는 쓰지 않는다.
			같은 사람이 같은 clientMessageId·같은 방·같은 본문으로 다시 보내면 처음 메시지를 그대로 201로 반환한다.
			본문은 받은 그대로 저장하며 공백만 있는 본문과 1,000자 초과는 400이다. 첨부·편집·삭제는 아직 없다.""")
	@ApiResponse(responseCode = "201", description = "전송 성공(재전송이면 처음 메시지)")
	@ApiResponse(responseCode = "404", description = "CHAT_ROOM_NOT_FOUND: 없거나 참여하지 않은(나간) 방",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409", description = "CLIENT_MESSAGE_ID_REUSED: 같은 clientMessageId를 다른 방이나 다른 본문에 사용",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@PostMapping("/chat/rooms/{roomId}/messages")
	public ResponseEntity<DataResponse<MessageResponse>> sendMessage(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "채팅방 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e71")
			@PathVariable UUID roomId,
			@RequestBody SendMessageRequest request) {
		MessageResponse message = chatService.sendMessage(CurrentUser.requireUserId(authUser), roomId, request);
		return ResponseEntity.status(HttpStatus.CREATED).body(DataResponse.of(message));
	}

}
