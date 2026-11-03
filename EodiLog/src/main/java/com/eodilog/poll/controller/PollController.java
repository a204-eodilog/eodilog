package com.eodilog.poll.controller;

import com.eodilog.global.common.error.ErrorResponse;
import com.eodilog.global.common.response.DataResponse;
import com.eodilog.global.common.response.PageResponse;
import com.eodilog.global.security.AuthUser;
import com.eodilog.poll.dto.AddCandidateRequest;
import com.eodilog.poll.dto.BallotRequest;
import com.eodilog.poll.dto.CreatePollRequest;
import com.eodilog.poll.dto.PollResponse;
import com.eodilog.poll.service.PollService;
import com.eodilog.trip.controller.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "투표", description = "여행 지역·장소 투표 열기·조회·내 선택·후보 추가")
@RestController
@RequestMapping("/api/v1/trips/{tripId}/polls")
@RequiredArgsConstructor
public class PollController {

	private final PollService pollService;

	@Operation(summary = "투표 목록", description = """
			여행의 ACTIVE 멤버만 조회한다. 최근 생성 순(createdAt DESC, id DESC)이며 각 투표의 집계·내 선택·확정 결과를 함께 준다.
			마감 시각이 지난 투표는 조회하면서 먼저 마감하므로 OPEN으로 보이지 않는다. 다음 페이지는 page.nextCursor를 cursor로 보낸다.""")
	@ApiResponse(responseCode = "200", description = "조회 성공")
	@ApiResponse(responseCode = "404", description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@GetMapping
	public ResponseEntity<PageResponse<PollResponse>> getPolls(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId,
			@Parameter(description = "이전 응답의 page.nextCursor. 첫 페이지는 생략")
			@RequestParam(required = false) String cursor,
			@Parameter(description = "페이지 크기(1~100)", example = "20")
			@RequestParam(defaultValue = "" + PollService.DEFAULT_LIMIT)
			@Min(1) @Max(PollService.MAX_LIMIT) int limit) {
		return ResponseEntity.ok(pollService.getPolls(CurrentUser.requireUserId(authUser), tripId, cursor, limit));
	}

	@Operation(summary = "투표 열기", description = """
			여행의 ACTIVE 멤버 누구나 연다. 지역 투표(REGION)는 후보에 regionId만, 장소 투표(PLACE)는 placeId만 넣는다.
			후보는 1~30개, 중복 없이, 존재하는 지역·장소여야 한다. 제목은 1~200자.
			마감 시각은 필수이며 지금보다 미래이고 30일 이내여야 한다(화면 기본값 지금+24시간). 마감 시각에 자동으로 마감한다.
			투표할 수 있는 사람은 그때그때 ACTIVE인 멤버다. 투표 중에 들어온 동행도 투표할 수 있고 나간 멤버의 표는 세지 않는다.""")
	@ApiResponse(responseCode = "201", description = "열기 성공")
	@ApiResponse(responseCode = "404", description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@PostMapping
	public ResponseEntity<DataResponse<PollResponse>> createPoll(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId,
			@RequestBody CreatePollRequest request) {
		PollResponse poll = pollService.createPoll(CurrentUser.requireUserId(authUser), tripId, request);
		return ResponseEntity.status(HttpStatus.CREATED).body(DataResponse.of(poll));
	}

	@Operation(summary = "투표 상세", description = """
			여행의 ACTIVE 멤버만 조회한다. 진행 중이면 지금 ACTIVE 멤버의 표로 센 집계를,
			마감했으면 마감 때 고정한 집계와 확정 후보(selectedCandidateIds)를 준다.""")
	@ApiResponse(responseCode = "200", description = "조회 성공")
	@ApiResponse(responseCode = "404",
			description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행 / POLL_NOT_FOUND: 없거나 다른 여행의 투표",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@GetMapping("/{pollId}")
	public ResponseEntity<DataResponse<PollResponse>> getPoll(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId,
			@Parameter(description = "투표 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e40")
			@PathVariable UUID pollId) {
		return ResponseEntity.ok(DataResponse.of(
				pollService.getPoll(CurrentUser.requireUserId(authUser), tripId, pollId)));
	}

	@Operation(summary = "내 선택 교체", description = """
			보낸 후보 목록으로 내 선택을 전체 교체한다. 여러 개 고를 수 있고 빈 배열이면 내 선택을 취소한다.
			서버 시각이 마감 시각 이상이면 409 POLL_CLOSED다.
			version은 후보 추가와 마감 때만 오르므로 다른 멤버가 투표해도 409가 나지 않는다.""")
	@ApiResponse(responseCode = "200", description = "교체 성공")
	@ApiResponse(responseCode = "404",
			description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행 / POLL_NOT_FOUND: 없거나 다른 여행의 투표",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409",
			description = "POLL_CLOSED: 마감된 투표 / VERSION_CONFLICT: 후보가 추가돼 다시 조회 후 시도",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@PutMapping("/{pollId}/ballot")
	public ResponseEntity<DataResponse<PollResponse>> replaceBallot(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId,
			@Parameter(description = "투표 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e40")
			@PathVariable UUID pollId,
			@RequestBody BallotRequest request) {
		return ResponseEntity.ok(DataResponse.of(
				pollService.replaceBallot(CurrentUser.requireUserId(authUser), tripId, pollId, request)));
	}

	@Operation(summary = "후보 추가", description = """
			진행 중인 투표에 후보를 하나 더한다. 투표 유형에 맞는 ID만, 이미 있는 후보는 안 되고 후보는 30개까지다.
			성공하면 투표 version이 오른다. 이미 투표한 멤버에게 보내는 알림은 알림 기능이 생긴 뒤 연결한다.""")
	@ApiResponse(responseCode = "201", description = "추가 성공")
	@ApiResponse(responseCode = "404",
			description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행 / POLL_NOT_FOUND: 없거나 다른 여행의 투표",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409",
			description = "POLL_CLOSED: 마감된 투표 / VERSION_CONFLICT: 투표가 바뀌어 다시 조회 후 시도",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@PostMapping("/{pollId}/candidates")
	public ResponseEntity<DataResponse<PollResponse>> addCandidate(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId,
			@Parameter(description = "투표 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e40")
			@PathVariable UUID pollId,
			@RequestBody AddCandidateRequest request) {
		PollResponse poll = pollService.addCandidate(CurrentUser.requireUserId(authUser), tripId, pollId, request);
		return ResponseEntity.status(HttpStatus.CREATED).body(DataResponse.of(poll));
	}

}
