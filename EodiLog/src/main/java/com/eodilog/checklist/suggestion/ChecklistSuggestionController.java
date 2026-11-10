package com.eodilog.checklist.suggestion;

import com.eodilog.global.common.error.ErrorResponse;
import com.eodilog.global.common.response.DataResponse;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.global.security.AuthUser;
import com.eodilog.job.JobRef;
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
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "준비물", description = "여행 공동 준비물 조회·추가·수정·체크·삭제")
@RestController
@RequestMapping("/api/v1/trips/{tripId}/checklist-suggestions")
@RequiredArgsConstructor
public class ChecklistSuggestionController {

	private final ChecklistSuggestionService checklistSuggestionService;

	@Operation(summary = "AI 준비물 추천 요청", description = """
			여행의 ACTIVE 멤버가 AI 준비물 제안 작업(CHECKLIST_SUGGESTIONS)을 등록한다. 공동 목록은 바꾸지 않는다.
			Idempotency-Key가 필수이며, 같은 키로 다시 보내면 처음 접수한 작업을 그대로 반환한다. 본문은 생략하거나 {}로 보낸다.
			요청 시점의 여행 기간·코스 장소·현재 준비물·지운 준비물 이름을 고정해 AI에 보낸다(지운 항목은 다시 제안하지 않음).
			진행은 GET /api/v1/jobs/{jobId}로 조회한다. 결과 items는 그 여행의 ACTIVE 멤버가 볼 수 있고,
			고른 제안은 POST /checklist에 sourceJobId·suggestionIndex(items 순번)로 추가한다.
			요청자가 나가거나 준비물 추천 설정을 끄면 진행 중인 작업은 CANCELLED가 된다.""")
	@ApiResponse(responseCode = "202", description = "접수. data는 CHECKLIST_SUGGESTIONS 작업 참조(JobRef)")
	@ApiResponse(responseCode = "404", description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409", description = """
			AI_FEATURE_DISABLED: 내 준비물 추천 설정이 OFF / IDEMPOTENCY_KEY_REUSED·REQUEST_IN_PROGRESS: 요청 키 충돌""",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@PostMapping
	public ResponseEntity<DataResponse<JobRef>> requestSuggestions(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId,
			@Parameter(description = "요청 중복 방지 키(1~100자)", required = true)
			@RequestHeader(name = IdempotencyService.HEADER_NAME, required = false) String idempotencyKey,
			@RequestBody(required = false) ChecklistSuggestionRequest request) {
		JobRef job = checklistSuggestionService.request(CurrentUser.requireUserId(authUser), tripId, idempotencyKey);
		return ResponseEntity.status(HttpStatus.ACCEPTED).body(DataResponse.of(job));
	}

}
