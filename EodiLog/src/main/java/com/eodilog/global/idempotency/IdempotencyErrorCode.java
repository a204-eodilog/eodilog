package com.eodilog.global.idempotency;

import com.eodilog.global.common.error.ErrorCode;
import org.springframework.http.HttpStatus;

public enum IdempotencyErrorCode implements ErrorCode {

	IDEMPOTENCY_KEY_REUSED(HttpStatus.CONFLICT, "같은 요청 키가 다른 내용의 요청에 이미 사용되었습니다."),
	REQUEST_IN_PROGRESS(HttpStatus.CONFLICT, "같은 요청을 처리하고 있습니다. 잠시 후 다시 시도해 주세요.");

	private final HttpStatus status;
	private final String message;

	IdempotencyErrorCode(HttpStatus status, String message) {
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
