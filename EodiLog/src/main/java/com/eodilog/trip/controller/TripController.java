package com.eodilog.trip.controller;

import com.eodilog.global.common.error.ErrorResponse;
import com.eodilog.global.common.response.DataResponse;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.global.security.AuthUser;
import com.eodilog.trip.dto.CreateTripRequest;
import com.eodilog.trip.dto.TripResponse;
import com.eodilog.trip.service.TripQueryService;
import com.eodilog.trip.service.TripService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "여행", description = "여행 생성·조회·수정")
@RestController
@RequestMapping("/api/v1/trips")
@RequiredArgsConstructor
public class TripController {

	private final TripService tripService;
	private final TripQueryService tripQueryService;

	@Operation(summary = "여행 생성", description = """
			로그인한 사용자가 여행을 만들고 방장이 된다. 이름만 필수이며 기간·여행지는 아는 경우만 보낸다.
			여행·방장 멤버십·그룹 채팅방·빈 단일 코스를 한 번에 만들고, 공동 피드는 만들지 않는다.
			상태는 기간으로 자동 판정하고 통화는 KRW로 고정한다.
			Idempotency-Key가 필수이며, 같은 키와 같은 본문으로 다시 보내면 처음 만든 여행을 그대로 반환한다.""")
	@ApiResponse(responseCode = "201", description = "생성 성공")
	@ApiResponse(responseCode = "409",
			description = "IDEMPOTENCY_KEY_REUSED: 같은 키를 다른 본문에 사용 / REQUEST_IN_PROGRESS: 같은 요청을 처리 중",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@PostMapping
	public ResponseEntity<DataResponse<TripResponse>> createTrip(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(in = ParameterIn.HEADER, required = true, description = "요청 중복 방지 키(1~100자). 재시도할 때 같은 값을 보낸다",
					example = "6d0f7c2e-1b7a-4f0e-9a51-7f3c1e2d4b8a")
			@RequestHeader(name = IdempotencyService.HEADER_NAME, required = false) String idempotencyKey,
			@RequestBody CreateTripRequest request) {
		TripResponse trip = tripService.createTrip(CurrentUser.requireUserId(authUser), idempotencyKey, request);
		return ResponseEntity.status(HttpStatus.CREATED).body(DataResponse.of(trip));
	}

	@Operation(summary = "여행 상세 조회", description = """
			여행의 ACTIVE 멤버만 조회한다. 공개 피드와 별개인 여행 내부 정보다.
			없는 여행·삭제된 여행·참여하지 않았거나 나간 여행은 구분하지 않고 404로 응답한다.
			상태는 조회 시점의 날짜(Asia/Seoul)로 계산한다.""")
	@ApiResponse(responseCode = "200", description = "조회 성공")
	@ApiResponse(responseCode = "404", description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@GetMapping("/{tripId}")
	public ResponseEntity<DataResponse<TripResponse>> getTrip(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId) {
		TripResponse trip = tripQueryService.getTrip(CurrentUser.requireUserId(authUser), tripId);
		return ResponseEntity.ok(DataResponse.of(trip));
	}

}
