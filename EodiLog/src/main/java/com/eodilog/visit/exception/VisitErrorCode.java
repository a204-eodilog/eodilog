package com.eodilog.visit.exception;

import com.eodilog.global.common.error.ErrorCode;
import org.springframework.http.HttpStatus;

public enum VisitErrorCode implements ErrorCode {

	// 다른 여행의 방문·이미 체크를 해제한 방문도 같은 응답을 쓴다
	VISIT_NOT_FOUND(HttpStatus.NOT_FOUND, "방문 기록을 찾을 수 없습니다."),

	// 평가를 쓰지 않았거나 이미 지운 방문
	REVIEW_NOT_FOUND(HttpStatus.NOT_FOUND, "평가를 찾을 수 없습니다."),

	// 평가가 있는 방문은 체크를 해제할 수 없다. 평가를 먼저 지운다
	REVIEW_EXISTS(HttpStatus.CONFLICT, "평가가 있는 방문입니다. 평가를 먼저 지워 주세요."),

	// 조회한 뒤 평가가 바뀌었다(expectedVersion 불일치)
	VERSION_CONFLICT(HttpStatus.CONFLICT, "평가가 변경되었습니다. 다시 조회해 주세요.");

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
