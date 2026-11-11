package com.eodilog.itinerary.route;

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

@Tag(name = "코스", description = "여행의 단일 공동 코스 조회·전체 교체·AI 제안 적용·되돌리기")
@RestController
@RequestMapping("/api/v1/trips/{tripId}/itinerary")
@RequiredArgsConstructor
public class RouteRecalculationController {

	private final RouteRecalculationService routeRecalculationService;

	@Operation(summary = "구간 이동 시간 다시 구하기", description = """
			여행의 ACTIVE 멤버. 이동 시간이 없는(UNAVAILABLE) 구간만 길찾기로 다시 구하는 작업(ROUTE_RECALCULATION)을 등록한다.
			코스를 직접 고치면 모든 구간의 시간이 비워지므로, 고친 뒤 이 요청으로 시간을 채운다.
			작업이 끝났을 때 코스 version이 expectedVersion과 같으면 그 구간만 갱신하고 version은 올리지 않는다.
			그사이 코스가 바뀌었으면 반영하지 않는다(결과의 baseVersion과 현재 version을 비교한다).
			가까운 구간은 대중교통 대신 도보(WALK)로 구해 저장할 수 있다. 거리·지도선은 비어 있을 수 있다.
			expectedVersion은 GET /itinerary의 version이다. Idempotency-Key는 선택이다. 보내면 같은 키·같은 본문에 처음 접수한 작업을 그대로 반환하고,
			보내지 않으면 요청마다 작업을 만든다(두 번 돌아도 같은 구간을 같은 값으로 채운다).
			진행·결과는 GET /jobs/{jobId}의 result `{baseVersion, legs}`로 조회한다(현재 ACTIVE 멤버 누구나).""")
	@ApiResponse(responseCode = "202", description = "작업 접수")
	@ApiResponse(responseCode = "400", description = "VALIDATION_ERROR: expectedVersion 없음, 보낸 키의 형식 오류",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "404", description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409", description = """
			VERSION_CONFLICT: 코스가 이미 바뀜(다시 조회) / IDEMPOTENCY_KEY_REUSED·REQUEST_IN_PROGRESS: 요청 키 충돌""",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "422", description = "INSUFFICIENT_DATA: 이동 시간이 없는 구간이 없음(fields legs)",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@PostMapping("/routes/recalculate")
	public ResponseEntity<DataResponse<JobRef>> recalculate(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId,
			@Parameter(description = "요청 중복 방지 키(선택, 1~100자)")
			@RequestHeader(name = IdempotencyService.HEADER_NAME, required = false) String idempotencyKey,
			@RequestBody RouteRecalculationRequest request) {
		JobRef job = routeRecalculationService.request(CurrentUser.requireUserId(authUser), tripId, idempotencyKey,
				request);
		return ResponseEntity.status(HttpStatus.ACCEPTED).body(DataResponse.of(job));
	}

}
