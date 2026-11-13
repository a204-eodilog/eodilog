package com.eodilog.expense.controller;

import com.eodilog.expense.dto.CreateExpenseRequest;
import com.eodilog.expense.dto.ExpenseResponse;
import com.eodilog.expense.dto.UpdateExpenseRequest;
import com.eodilog.expense.service.ExpenseService;
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
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "경비", description = "여행 경비 조회·등록·수정·삭제와 정산 상태")
@RestController
@RequestMapping("/api/v1/trips/{tripId}/expenses")
@RequiredArgsConstructor
public class ExpenseController {

	private final ExpenseService expenseService;

	@PostMapping("/batch")
	@Operation(summary = "경비 일괄 등록", description = "ACTIVE 멤버. 1~10건을 입력 순서대로 하나의 트랜잭션에서 등록한다. 한 건이라도 실패하면 모두 취소하며, Idempotency-Key가 같으면 최초 응답을 반환한다. 음성 초안은 사용자 확인 후 이 API로 저장한다.")
	@ApiResponse(responseCode = "201", description = "전체 등록 성공")
	@ApiResponse(responseCode = "422", description = "INPUT_LIMIT_EXCEEDED 또는 INVALID_PARTICIPANTS 또는 CURRENCY_MISMATCH")
	@ApiResponse(responseCode = "409", description = "IDEMPOTENCY_KEY_REUSED 또는 REQUEST_IN_PROGRESS")
	public ResponseEntity<DataResponse<com.eodilog.expense.dto.ExpenseBatchResponse>> createBatch(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user, @PathVariable UUID tripId,
			@RequestHeader(name = IdempotencyService.HEADER_NAME, required = false) String key,
			@RequestBody com.eodilog.expense.dto.CreateExpensesRequest request) {
		return ResponseEntity.status(HttpStatus.CREATED).body(DataResponse.of(
				expenseService.createBatch(CurrentUser.requireUserId(user), tripId, key, request)));
	}

	@Operation(summary = "경비 목록", description = """
			여행의 ACTIVE 멤버만 조회한다. 최근 등록 순(createdAt DESC, id DESC)이며 삭제한 경비는 뺀다.
			여행에서 나간 멤버도 과거 결제자·분담자로 그대로 보여 준다. 다음 페이지는 page.nextCursor를 cursor로 보낸다.""")
	@ApiResponse(responseCode = "200", description = "조회 성공")
	@ApiResponse(responseCode = "404", description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@GetMapping
	public ResponseEntity<PageResponse<ExpenseResponse>> getExpenses(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId,
			@Parameter(description = "이전 응답의 page.nextCursor. 첫 페이지는 생략")
			@RequestParam(required = false) String cursor,
			@Parameter(description = "페이지 크기(1~100)", example = "20")
			@RequestParam(defaultValue = "" + ExpenseService.DEFAULT_LIMIT)
			@Min(1) @Max(ExpenseService.MAX_LIMIT) int limit) {
		return ResponseEntity.ok(
				expenseService.getExpenses(CurrentUser.requireUserId(authUser), tripId, cursor, limit));
	}

	@Operation(summary = "경비 등록", description = """
			여행의 ACTIVE 멤버라면 누구나 등록하고, 등록자는 요청한 사람으로 서버가 정한다.
			결제자·분담자는 이 여행의 ACTIVE 멤버여야 하며, 원금(KRW 양의 정수)을 분담자에게 균등 분담한다.
			나누어떨어지지 않는 1원은 참여 순이 빠른 분담자부터 1원씩 더 낸다. 정산의 10원 올림은 여기서 하지 않는다.
			등록할 때마다 여행의 비용 버전(expenseVersion)이 오른다.
			Idempotency-Key가 필수이며, 같은 키와 같은 본문으로 다시 보내면 처음 등록한 경비를 그대로 반환한다.""")
	@ApiResponse(responseCode = "201", description = "등록 성공")
	@ApiResponse(responseCode = "404", description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409",
			description = "IDEMPOTENCY_KEY_REUSED: 같은 키를 다른 본문에 사용 / REQUEST_IN_PROGRESS: 같은 요청을 처리 중",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "422",
			description = "CURRENCY_MISMATCH: KRW가 아닌 통화 / INVALID_PARTICIPANTS: 이 여행의 ACTIVE 멤버가 아닌 결제자·분담자",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@PostMapping
	public ResponseEntity<DataResponse<ExpenseResponse>> createExpense(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId,
			@Parameter(in = ParameterIn.HEADER, required = true, description = "요청 중복 방지 키(1~100자). 재시도할 때 같은 값을 보낸다",
					example = "6d0f7c2e-1b7a-4f0e-9a51-7f3c1e2d4b8a")
			@RequestHeader(name = IdempotencyService.HEADER_NAME, required = false) String idempotencyKey,
			@RequestBody CreateExpenseRequest request) {
		ExpenseResponse expense = expenseService.createExpense(
				CurrentUser.requireUserId(authUser), tripId, idempotencyKey, request);
		return ResponseEntity.status(HttpStatus.CREATED).body(DataResponse.of(expense));
	}

	@Operation(summary = "경비 수정", description = """
			경비를 등록한 사람이 여행의 ACTIVE 멤버일 때만 수정한다. 방장이나 결제자라도 등록자가 아니면 403이다.
			생략한 필드는 그대로 두고 memo만 null로 비울 수 있다. 분담자는 보낸 목록으로 전체 교체한다.
			원금이나 분담자가 바뀌면 분담액을 다시 계산한다. 새로 넣는 결제자·분담자는 ACTIVE 멤버여야 하고,
			이미 들어 있던 나간 멤버는 그대로 둘 수 있다.
			expectedVersion이 현재 경비 version과 다르면 409로 거부한다. 바뀐 값이 없으면 version을 올리지 않는다.""")
	@ApiResponse(responseCode = "200", description = "수정 성공(또는 바뀐 값 없음)")
	@ApiResponse(responseCode = "403", description = "FORBIDDEN: 경비를 등록한 사람이 아님",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "404",
			description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행 / EXPENSE_NOT_FOUND: 없거나 삭제된 경비",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409", description = "VERSION_CONFLICT: 경비가 먼저 수정됨. 다시 조회 후 시도",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "422",
			description = "CURRENCY_MISMATCH: KRW가 아닌 통화 / INVALID_PARTICIPANTS: 새로 넣을 수 없는 결제자·분담자",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@PatchMapping("/{expenseId}")
	public ResponseEntity<DataResponse<ExpenseResponse>> updateExpense(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId,
			@Parameter(description = "경비 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e90")
			@PathVariable UUID expenseId,
			@RequestBody UpdateExpenseRequest request) {
		ExpenseResponse expense = expenseService.updateExpense(
				CurrentUser.requireUserId(authUser), tripId, expenseId, request);
		return ResponseEntity.ok(DataResponse.of(expense));
	}

	@Operation(summary = "경비 삭제", description = """
			경비를 등록한 사람이 여행의 ACTIVE 멤버일 때만 삭제한다. 방장이나 결제자라도 등록자가 아니면 403이다.
			여행의 비용 버전이 올라 이전 정산 계산은 다시 계산해야 하는 상태가 된다.""")
	@ApiResponse(responseCode = "204", description = "삭제 성공")
	@ApiResponse(responseCode = "403", description = "FORBIDDEN: 경비를 등록한 사람이 아님",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "404",
			description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행 / EXPENSE_NOT_FOUND: 없거나 이미 삭제된 경비",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409", description = "VERSION_CONFLICT: 경비가 먼저 수정됨. 다시 조회 후 시도",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@DeleteMapping("/{expenseId}")
	public ResponseEntity<Void> deleteExpense(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId,
			@Parameter(description = "경비 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e90")
			@PathVariable UUID expenseId,
			@Parameter(description = "조회한 경비의 version", example = "1", required = true)
			@RequestParam(required = false) Long expectedVersion) {
		expenseService.deleteExpense(CurrentUser.requireUserId(authUser), tripId, expenseId, expectedVersion);
		return ResponseEntity.noContent().build();
	}

}
