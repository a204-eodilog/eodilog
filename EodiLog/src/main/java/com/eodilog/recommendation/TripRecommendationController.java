package com.eodilog.recommendation;

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
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "추천", description = "AI 여행지 추천(그룹 즐겨찾기·멤버 취향 기반)")
@RestController
@RequestMapping("/api/v1/trips/{tripId}/recommendations")
@RequiredArgsConstructor
public class TripRecommendationController {

	private final TripRecommendationService service;

	@Operation(summary = "AI 여행지 추천 요청", description = """
			여행의 ACTIVE 멤버. 그룹 즐겨찾기와 멤버 취향으로 여행지(REGION)·장소(PLACE) 추천 작업(TRIP_RECOMMENDATION)을 등록한다.
			취향은 멤버마다 이 여행에서 쓸 수 있는 것만 쓴다(여행별 공유 범위, 추론 허용). 장소 후보는 여행지 지역(하위 포함)에서
			취향과 맞는 곳을 고르고 그룹 즐겨찾기 장소는 뺀다. regionId를 주면 그 지역에서만 고른다.
			즐겨찾기 3곳·취향 있는 멤버 2명이 안 되어도 접수하고, 결과의 insufficientData가 true다.
			Idempotency-Key가 필수이며 같은 키·같은 본문이면 처음 접수한 작업을 그대로 반환한다.
			진행·결과는 GET /trips/{tripId}/recommendations/{jobId}로 조회한다.""")
	@ApiResponse(responseCode = "202", description = "작업 접수")
	@ApiResponse(responseCode = "400", description = "VALIDATION_ERROR: 키 없음, 없는 regionId",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "404", description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409", description = "IDEMPOTENCY_KEY_REUSED·REQUEST_IN_PROGRESS: 요청 키 충돌",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@PostMapping
	public ResponseEntity<DataResponse<JobRef>> request(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId,
			@Parameter(description = "요청 중복 방지 키(1~100자)", required = true)
			@RequestHeader(name = IdempotencyService.HEADER_NAME, required = false) String idempotencyKey,
			@RequestBody(required = false) TripRecommendationRequest request) {
		JobRef job = service.request(CurrentUser.requireUserId(authUser), tripId, idempotencyKey, request);
		return ResponseEntity.status(HttpStatus.ACCEPTED).body(DataResponse.of(job));
	}

	@Operation(summary = "AI 여행지 추천 진행·결과 조회", description = """
			여행의 현재 ACTIVE 멤버 누구나. job.status가 QUEUED·RUNNING이면 진행 중이고 items는 빈 배열이다.
			FAILED·CANCELLED면 사유가 job.error에 있다. SUCCEEDED면 추천(items), 근거 수(basis), 자료 부족(insufficientData)을 준다.
			장소·지역은 공개 Place·Region 모양이다.""")
	@ApiResponse(responseCode = "200", description = "조회 성공")
	@ApiResponse(responseCode = "404", description = "JOB_NOT_FOUND: 없거나 다른 여행·다른 종류의 작업, 볼 수 없는 작업",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@GetMapping("/{jobId}")
	public DataResponse<TripRecommendationResponse> get(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)") @PathVariable UUID tripId,
			@Parameter(description = "작업 ID(UUID)") @PathVariable UUID jobId) {
		return DataResponse.of(service.get(CurrentUser.requireUserId(authUser), tripId, jobId));
	}

}
