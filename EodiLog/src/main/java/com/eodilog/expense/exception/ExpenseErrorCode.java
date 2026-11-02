package com.eodilog.expense.exception;

import com.eodilog.global.common.error.ErrorCode;
import org.springframework.http.HttpStatus;

public enum ExpenseErrorCode implements ErrorCode {

	// 다른 여행의 경비·삭제된 경비도 같은 응답을 쓴다
	EXPENSE_NOT_FOUND(HttpStatus.NOT_FOUND, "경비를 찾을 수 없습니다."),
	// 다른 수정이 먼저 반영됐다. 덮어쓰지 않고 다시 조회하게 한다(명세 §2)
	VERSION_CONFLICT(HttpStatus.CONFLICT, "경비가 변경되었습니다. 다시 조회해 주세요."),
	// 경비는 KRW 정수만 받는다(명세 §7, D-7)
	CURRENCY_MISMATCH(HttpStatus.UNPROCESSABLE_CONTENT, "경비는 원화(KRW)로만 입력할 수 있습니다."),
	// 결제자·분담자가 이 여행의 멤버가 아니거나 새로 넣을 수 없는 멤버다
	INVALID_PARTICIPANTS(HttpStatus.UNPROCESSABLE_CONTENT, "결제자와 분담자는 이 여행의 동행이어야 합니다."),
	// 다른 여행의 정산 계산도 같은 응답을 쓴다
	SETTLEMENT_NOT_FOUND(HttpStatus.NOT_FOUND, "정산 결과를 찾을 수 없습니다.");

	private final HttpStatus status;
	private final String message;

	ExpenseErrorCode(HttpStatus status, String message) {
		this.status = status;
		this.message = message;
	}

	@Override
	public HttpStatus status() {
		return status;
	}

	@Override
	public String code() {
		return name();
	}

	@Override
	public String message() {
		return message;
	}

}
