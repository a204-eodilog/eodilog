package com.eodilog.expense.controller;

import com.eodilog.expense.dto.SettlementCalculationRequest;
import com.eodilog.expense.dto.SettlementStateResponse;
import com.eodilog.expense.service.SettlementService;
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
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "경비", description = "여행 경비 조회·등록·수정·삭제와 정산 상태")
@RestController
@RequestMapping("/api/v1/trips/{tripId}")
@RequiredArgsConstructor
public class SettlementController {

	private final SettlementService settlementService;

	@Operation(summary = "정산 상태 조회", description = """
			여행의 ACTIVE 멤버만 조회한다. 현재 정산 계산 결과·현재 비용 버전·재계산 필요 여부를 반환하며, 조회만으로 계산을 만들지 않는다.
			정산 방식(1인 부담액 10원 올림 시점·차액 귀속, Q-10)이 정해지기 전이라 current는 항상 null이다.""")
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
			정산 방식(Q-10)이 정해지기 전이라 ACTIVE 멤버라도 항상 409 SETTLEMENT_POLICY_PENDING으로 거부한다.
			정책이 정해지면 비용 스냅샷·원금/올림 차액·송금 제안을 저장하고 201로 응답하도록 바뀐다.""")
	@ApiResponse(responseCode = "404", description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409", description = "SETTLEMENT_POLICY_PENDING: 정산 방식 합의 전이라 계산하지 않음",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@PostMapping("/settlements")
	public ResponseEntity<Void> requestSettlement(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId,
			@RequestBody(required = false) SettlementCalculationRequest request) {
		settlementService.requestCalculation(CurrentUser.requireUserId(authUser), tripId);
		return ResponseEntity.noContent().build();
	}

}
