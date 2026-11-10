package com.eodilog.itinerary.controller;

import com.eodilog.global.common.error.ErrorResponse;
import com.eodilog.global.common.response.DataResponse;
import com.eodilog.global.security.AuthUser;
import com.eodilog.itinerary.dto.ItineraryResponse;
import com.eodilog.itinerary.dto.ItineraryWriteRequest;
import com.eodilog.itinerary.service.ItineraryService;
import com.eodilog.trip.controller.CurrentUser;
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
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "코스", description = "여행의 단일 공동 코스 조회·전체 교체·AI 제안 적용·되돌리기")
@RestController
@RequestMapping("/api/v1/trips/{tripId}/itinerary")
@RequiredArgsConstructor
public class ItineraryController {

	private final ItineraryService itineraryService;

	@Operation(summary = "코스 조회", description = """
			여행의 ACTIVE 멤버만 조회한다. 여행당 코스는 하나이며 새 여행은 version 1의 빈 코스다.
			항목은 날짜·순서 순, 구간은 출발 항목의 날짜·순서 순이다. 경로 공급자 연동 전이라 구간의 시간·거리·지도선은 null이고 status는 UNAVAILABLE이다.""")
	@ApiResponse(responseCode = "200", description = "조회 성공")
	@ApiResponse(responseCode = "404", description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@GetMapping
	public ResponseEntity<DataResponse<ItineraryResponse>> getItinerary(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId) {
		return ResponseEntity.ok(DataResponse.of(
				itineraryService.getItinerary(CurrentUser.requireUserId(authUser), tripId)));
	}

	@Operation(summary = "코스 전체 교체", description = """
			여행의 ACTIVE 멤버 누구나 현재 코스를 통째로 바꾼다. 승인 단계는 없다.
			요청에 없는 기존 항목은 지워지고, id를 보낸 항목은 유지되며(이 코스의 항목이 아니면 400), 새 항목은 서버가 id를 발급한다.
			항목은 최대 200개, 장소는 존재해야 하고, day는 1 이상(여행 기간이 있으면 일수 이하), 날짜별 order는 1부터 빈틈없이, startTime은 HH:mm, stayMinutes는 1~1440이다.
			구간은 같은 날짜의 인접한 항목 쌍마다 정확히 하나여야 하며 빠지거나 겹치거나 인접하지 않으면 422다. 하루에 항목이 하나면 그 날은 구간이 없다.
			바뀐 게 없으면 version을 올리지 않고 현재 코스를 그대로 돌려준다. expectedVersion이 다르면 409이며 다시 조회한 뒤 시도한다.""")
	@ApiResponse(responseCode = "200", description = "교체 성공(바뀐 게 있으면 version 증가)")
	@ApiResponse(responseCode = "404", description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409", description = "VERSION_CONFLICT: 다른 멤버가 먼저 바꾼 코스. 다시 조회 후 시도",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "422", description = "INVALID_ROUTE_LEGS: 구간이 빠지거나 겹치거나 인접하지 않음",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@PutMapping
	public ResponseEntity<DataResponse<ItineraryResponse>> replaceItinerary(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId,
			@RequestBody ItineraryWriteRequest request) {
		return ResponseEntity.ok(DataResponse.of(
				itineraryService.replaceItinerary(CurrentUser.requireUserId(authUser), tripId, request)));
	}

}
