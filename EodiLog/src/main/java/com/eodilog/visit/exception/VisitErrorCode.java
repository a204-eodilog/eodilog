package com.eodilog.visit.exception;

import com.eodilog.global.common.error.ErrorCode;
import org.springframework.http.HttpStatus;

public enum VisitErrorCode implements ErrorCode {

	// 다른 여행의 방문·이미 체크를 해제한 방문도 같은 응답을 쓴다
	VISIT_NOT_FOUND(HttpStatus.NOT_FOUND, "방문 기록을 찾을 수 없습니다.");

	private final HttpStatus status;
	private final String message;

	VisitErrorCode(HttpStatus status, String message) {
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
