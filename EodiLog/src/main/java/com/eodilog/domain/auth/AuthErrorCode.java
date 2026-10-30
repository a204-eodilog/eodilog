package com.eodilog.domain.auth;

import com.eodilog.global.common.error.ErrorCode;
import org.springframework.http.HttpStatus;

public enum AuthErrorCode implements ErrorCode {
	UNSUPPORTED_PROVIDER(HttpStatus.BAD_REQUEST, "KAKAO만 지원합니다."),
	PROVIDER_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "카카오 로그인에 실패했습니다. 다시 시작해 주세요."),
	PROFILE_INCOMPLETE(HttpStatus.FORBIDDEN, "닉네임을 입력해 가입을 완료해 주세요.");

	private final HttpStatus status;
	private final String message;

	AuthErrorCode(HttpStatus status, String message) {
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
