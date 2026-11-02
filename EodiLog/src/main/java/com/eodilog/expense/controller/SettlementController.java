package com.eodilog.expense.controller;

import com.eodilog.expense.dto.SettlementCalculationRequest;
import com.eodilog.expense.dto.SettlementResponse;
import com.eodilog.expense.dto.SettlementStateResponse;
import com.eodilog.expense.service.ExpenseService;
import com.eodilog.expense.service.SettlementService;
import com.eodilog.global.common.error.ErrorResponse;
import com.eodilog.global.common.response.DataResponse;
import com.eodilog.global.common.response.PageResponse;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.global.security.AuthUser;
import com.eodilog.trip.controller.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
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
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "경비", description = "여행 경비 조회·등록·수정·삭제와 정산 상태")
@RestController
@RequestMapping("/api/v1/trips/{tripId}")
@RequiredArgsConstructor
public class SettlementController {

	private static final String CALCULATION_RULE = """
			사람별 원금 분담 합계를 여행 전체로 더한 뒤 한 번만 10원 단위로 올린다(지출별 올림 없음).
			올림으로 생긴 전체 차액은 원금 기준 받을 돈이 가장 많은 한 사람이 가진다(동률은 참여 순).
			송금 제안 금액은 다시 올리지 않고, 정산 완료 상태는 없다.""";

	private final SettlementService settlementService;

	@Operation(summary = "정산 상태 조회", description = """
			여행의 ACTIVE 멤버만 조회한다. 현재 정산 계산 결과·현재 비용 버전·재계산 필요 여부를 반환하며, 조회만으로 계산을 만들지 않는다.
			아직 계산한 적이 없으면 current는 null이다. 현재 계산 이후 경비가 바뀌었으면 recalculationRequired가 true다.""")
	@ApiResponse(responseCode = "200", description = "조회 성공")
	@ApiResponse(responseCode = "404", description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@GetMapping("/settlement")
	public ResponseEntity<DataResponse<SettlementStateResponse>> getSettlementState(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId) {
		return ResponseEntity.ok(DataResponse.of(
				settlementService.getState(CurrentUser.requireUserId(authUser), tripId)));
	}

	@Operation(summary = "정산 계산", description = """
			여행의 ACTIVE 멤버라면 누구나 지금 경비로 정산을 계산해 저장하고, 이 계산이 현재 계산이 된다.
			expectedExpenseVersion이 현재 비용 버전과 다르면 다른 경비 변경이 먼저 반영된 것이므로 409로 거부한다.
			Idempotency-Key가 필수이며, 같은 키와 같은 본문으로 다시 보내면 처음 계산 결과를 그대로 반환한다.
			""" + CALCULATION_RULE)
	@ApiResponse(responseCode = "201", description = "계산 성공")
	@ApiResponse(responseCode = "404", description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409",
			description = "VERSION_CONFLICT: 비용 버전이 다름 / IDEMPOTENCY_KEY_REUSED: 같은 키를 다른 본문에 사용 / REQUEST_IN_PROGRESS: 같은 요청을 처리 중",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@PostMapping("/settlements")
	public ResponseEntity<DataResponse<SettlementResponse>> calculateSettlement(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId,
			@Parameter(in = ParameterIn.HEADER, required = true, description = "요청 중복 방지 키(1~100자). 재시도할 때 같은 값을 보낸다",
					example = "6d0f7c2e-1b7a-4f0e-9a51-7f3c1e2d4b8a")
			@RequestHeader(name = IdempotencyService.HEADER_NAME, required = false) String idempotencyKey,
			@RequestBody SettlementCalculationRequest request) {
		SettlementResponse settlement = settlementService.calculate(
				CurrentUser.requireUserId(authUser), tripId, idempotencyKey, request);
		return ResponseEntity.status(HttpStatus.CREATED).body(DataResponse.of(settlement));
	}

	@Operation(summary = "이전 정산 계산 목록", description = """
			여행의 ACTIVE 멤버만 조회한다. 최근 계산 순(calculatedAt DESC, id DESC) 커서 페이지다.
			여행이 있는 동안 모든 계산을 보관하며, 현재 계산이 아니거나 이후 경비가 바뀐 계산은 stale=true다.""")
	@ApiResponse(responseCode = "200", description = "조회 성공")
	@ApiResponse(responseCode = "404", description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@GetMapping("/settlements")
	public ResponseEntity<PageResponse<SettlementResponse>> getSettlements(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId,
			@Parameter(description = "이전 응답의 page.nextCursor. 첫 페이지는 생략")
			@RequestParam(required = false) String cursor,
			@Parameter(description = "페이지 크기(1~100)", example = "20")
			@RequestParam(defaultValue = "" + ExpenseService.DEFAULT_LIMIT)
			@Min(1) @Max(ExpenseService.MAX_LIMIT) int limit) {
		return ResponseEntity.ok(
				settlementService.getSettlements(CurrentUser.requireUserId(authUser), tripId, cursor, limit));
	}

	@Operation(summary = "정산 계산 상세", description = """
			여행의 ACTIVE 멤버만 조회한다. 계산 시각·기준 비용 버전·포함된 경비(계산 당시 값)를 그대로 보여 준다.""")
	@ApiResponse(responseCode = "200", description = "조회 성공")
	@ApiResponse(responseCode = "404",
			description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행 / SETTLEMENT_NOT_FOUND: 없거나 다른 여행의 계산",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@GetMapping("/settlements/{settlementId}")
	public ResponseEntity<DataResponse<SettlementResponse>> getSettlement(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId,
			@Parameter(description = "정산 계산 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6eb0")
			@PathVariable UUID settlementId) {
		return ResponseEntity.ok(DataResponse.of(
				settlementService.getSettlement(CurrentUser.requireUserId(authUser), tripId, settlementId)));
	}

}
