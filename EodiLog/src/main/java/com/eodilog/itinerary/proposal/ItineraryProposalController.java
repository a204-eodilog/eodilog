package com.eodilog.itinerary.proposal;

import com.eodilog.global.common.error.ErrorResponse;
import com.eodilog.global.common.response.DataResponse;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.global.security.AuthUser;
import com.eodilog.trip.controller.CurrentUser;
import com.eodilog.itinerary.dto.ItineraryResponse;
import com.eodilog.itinerary.dto.ItineraryUndoRequest;
import com.eodilog.itinerary.service.ItineraryService;
import com.eodilog.job.JobRef;
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
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "코스", description = "여행의 단일 공동 코스 조회·전체 교체·AI 제안 적용·되돌리기")
@RestController
@RequestMapping("/api/v1/trips/{tripId}/itinerary")
@RequiredArgsConstructor
public class ItineraryProposalController {

	private final ItineraryProposalService itineraryProposalService;
	private final ItineraryService itineraryService;

	@Operation(summary = "AI 코스 제안 요청", description = """
			여행의 ACTIVE 멤버. 모은 장소(여행 저장 장소와 현재 코스 장소, 최대 200곳)와 여행 기간으로 날짜별 코스 제안 작업(ITINERARY_PROPOSAL)을 등록한다.
			reason=INITIAL: 코스가 이미 있어도 요청할 수 있고, 적용하면 코스 전체가 제안으로 바뀐다.
			reason=WEATHER: sourceWeatherJobId(같은 여행의 성공한 날씨 대안 작업)와 selectedAlternativeId(TIME_SHIFT·PLACE_SWAP)가 필수다.
			고른 대안의 그날만 바뀐다. 요청자의 날씨 대안 설정이 OFF면 409, 대안을 만든 뒤 코스가 바뀌었으면 409 VERSION_CONFLICT다.
			PLACE_REMOVED는 아직 지원하지 않는다.
			제안만 만들며 코스는 apply 전까지 그대로다. expectedVersion은 GET /itinerary의 version이다.
			Idempotency-Key가 필수이며 같은 키·같은 본문이면 처음 접수한 작업을 그대로 반환한다.
			진행·결과는 GET /trips/{tripId}/itinerary/proposals/{jobId}로 조회한다.""")
	@ApiResponse(responseCode = "202", description = "작업 접수")
	@ApiResponse(responseCode = "400", description = """
			VALIDATION_ERROR: 키 없음, reason·expectedVersion 없음, PLACE_REMOVED, 사유에 맞지 않는 필드,
			WEATHER에 원본 작업·대안 ID 없음, 결과에 없는 selectedAlternativeId""",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "404", description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행 / JOB_NOT_FOUND: 없거나 다른 여행의 날씨 대안 작업(WEATHER)",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409", description = """
			VERSION_CONFLICT: 코스가 이미 바뀜(다시 조회) / AI_FEATURE_DISABLED: 요청자의 날씨 대안 설정 OFF(WEATHER) /
			PROPOSAL_NOT_READY: 원본 날씨 대안 작업이 아직 성공하지 않음 / IDEMPOTENCY_KEY_REUSED·REQUEST_IN_PROGRESS: 요청 키 충돌""",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "422", description = """
			INSUFFICIENT_DATA: 여행 기간(fields trip.startDate)이나 모은 장소(fields places)가 없음 /
			INPUT_LIMIT_EXCEEDED: 대상 장소가 200곳 초과 / UNSCHEDULABLE_ALTERNATIVE: INFO(안내만) 대안은 코스를 바꿀 수 없음""",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@PostMapping("/proposals")
	public ResponseEntity<DataResponse<JobRef>> requestProposal(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId,
			@Parameter(description = "요청 중복 방지 키(1~100자)", required = true)
			@RequestHeader(name = IdempotencyService.HEADER_NAME, required = false) String idempotencyKey,
			@RequestBody ItineraryProposalRequest request) {
		JobRef job = itineraryProposalService.request(CurrentUser.requireUserId(authUser), tripId, idempotencyKey,
				request);
		return ResponseEntity.status(HttpStatus.ACCEPTED).body(DataResponse.of(job));
	}

	@Operation(summary = "AI 코스 제안 진행·결과 조회", description = """
			여행의 현재 ACTIVE 멤버 누구나. job.status가 QUEUED·RUNNING이면 진행 중이고 proposed=null이다.
			FAILED·CANCELLED면 사유가 job.error에 있다. SUCCEEDED면 제안 코스(proposed)와 변경 요약(diff)을 준다.
			변경 전 코스는 GET /itinerary로 본다. 현재 코스 version이 baseVersion과 같을 때만 적용할 수 있다.
			appliedAt은 적용 시각, canUndo는 지금 되돌릴 수 있는지다.""")
	@ApiResponse(responseCode = "200", description = "조회 성공")
	@ApiResponse(responseCode = "404", description = "JOB_NOT_FOUND: 없거나 다른 여행·다른 종류의 작업, 볼 수 없는 작업",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@GetMapping("/proposals/{jobId}")
	public ResponseEntity<DataResponse<ItineraryProposalResponse>> getProposal(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId,
			@Parameter(description = "작업 ID(UUID)", example = "019a0000-0000-7000-8000-000000000001")
			@PathVariable UUID jobId) {
		return ResponseEntity.ok(DataResponse.of(
				itineraryProposalService.get(CurrentUser.requireUserId(authUser), tripId, jobId)));
	}

	@Operation(summary = "AI 코스 제안 적용", description = """
			여행의 ACTIVE 멤버 누구나(방장 승인 없음). 성공한 제안으로 코스 전체를 한 번에 바꾸고 version을 올린다.
			유지되는 기존 항목은 id가 그대로이고 새 항목은 id를 새로 받는다. 구간에는 AI가 준 이동 시간을 저장한다.
			적용 직전 코스를 보관해 POST /itinerary/undo로 한 번 되돌릴 수 있다. 같은 제안은 한 번만 적용한다.""")
	@ApiResponse(responseCode = "200", description = "적용 성공. 바뀐 코스")
	@ApiResponse(responseCode = "404", description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행 / JOB_NOT_FOUND: 없거나 다른 여행의 제안",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409", description = """
			ALREADY_APPLIED: 이미 적용한 제안 / PROPOSAL_NOT_READY: 진행 중·실패·취소된 제안 /
			VERSION_CONFLICT: 제안 뒤 코스가 바뀌었거나 여행 기간이 줄어 오래된 제안(새로 요청) /
			AI_FEATURE_DISABLED: 날씨 대안에서 온 제안인데 적용하는 사람의 날씨 대안 설정이 OFF""",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@PostMapping("/proposals/{jobId}/apply")
	public ResponseEntity<DataResponse<ItineraryResponse>> applyProposal(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId,
			@Parameter(description = "작업 ID(UUID)", example = "019a0000-0000-7000-8000-000000000001")
			@PathVariable UUID jobId,
			@RequestBody ItineraryProposalApplyRequest request) {
		return ResponseEntity.ok(DataResponse.of(
				itineraryProposalService.apply(CurrentUser.requireUserId(authUser), tripId, jobId, request)));
	}

	@Operation(summary = "직전 AI 적용 되돌리기", description = """
			여행의 ACTIVE 멤버 누구나. 직전 AI 제안 적용 한 번만 되돌려 적용 전 코스(항목 id 포함)로 복원하고 version을 올린다.
			적용 뒤 다른 코스 쓰기가 있었거나, appliedJobId가 직전 적용이 아니거나, 이미 되돌렸으면 409 UNDO_UNAVAILABLE이다.
			시간 제한은 아직 없다(Q-15).""")
	@ApiResponse(responseCode = "200", description = "되돌리기 성공. 복원된 코스")
	@ApiResponse(responseCode = "404", description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409", description = """
			VERSION_CONFLICT: expectedVersion이 현재 코스와 다름 / UNDO_UNAVAILABLE: 되돌릴 수 있는 AI 적용이 아님""",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@PostMapping("/undo")
	public ResponseEntity<DataResponse<ItineraryResponse>> undo(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId,
			@RequestBody ItineraryUndoRequest request) {
		return ResponseEntity.ok(DataResponse.of(
				itineraryService.undo(CurrentUser.requireUserId(authUser), tripId, request)));
	}

}
