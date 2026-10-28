package com.eodilog.global.common.error;

import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;

// API 명세 §2 공통 실패. 업무별 오류는 각 도메인 enum에 둔다
public enum CommonErrorCode implements ErrorCode {

	VALIDATION_ERROR(HttpStatus.BAD_REQUEST, "요청 값이 올바르지 않습니다."),
	UNAUTHENTICATED(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다."),
	FORBIDDEN(HttpStatus.FORBIDDEN, "접근 권한이 없습니다."),
	NOT_FOUND(HttpStatus.NOT_FOUND, "요청한 자료를 찾을 수 없습니다."),
	METHOD_NOT_ALLOWED(HttpStatus.METHOD_NOT_ALLOWED, "지원하지 않는 요청 방식입니다."),
	NOT_ACCEPTABLE(HttpStatus.NOT_ACCEPTABLE, "지원하지 않는 응답 형식입니다."),
	CONFLICT(HttpStatus.CONFLICT, "요청이 현재 상태와 충돌합니다."),
	UNSUPPORTED_MEDIA_TYPE(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "지원하지 않는 요청 형식입니다."),
	RATE_LIMITED(HttpStatus.TOO_MANY_REQUESTS, "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."),
	INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");

	private final HttpStatus status;
	private final String message;

	CommonErrorCode(HttpStatus status, String message) {
		this.status = status;
		this.message = message;
	}

	// Spring MVC가 정한 상태 코드에 맞는 공통 오류. 따로 정의하지 않은 4xx는 VALIDATION_ERROR, 5xx는 INTERNAL_ERROR로 묶는다
	public static CommonErrorCode fromStatus(HttpStatusCode statusCode) {
		for (CommonErrorCode errorCode : values()) {
			if (errorCode.status.value() == statusCode.value()) {
				return errorCode;
			}
		}
		return statusCode.is4xxClientError() ? VALIDATION_ERROR : INTERNAL_ERROR;
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
