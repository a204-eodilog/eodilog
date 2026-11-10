package com.eodilog.user;

import com.eodilog.global.common.error.ErrorCode;
import org.springframework.http.HttpStatus;

// 회원 조회·프로필 수정 업무 실패(명세 §3)
public enum UserErrorCode implements ErrorCode {

	// 없는 회원·탈퇴 회원·가입 대기 회원을 구분하지 않는다
	USER_NOT_FOUND(HttpStatus.NOT_FOUND, "사용자를 찾을 수 없습니다."),
	// 없는 파일·남의 파일·프로필 용도가 아닌 파일·업로드가 끝나지 않은 파일을 구분하지 않는다
	INVALID_PROFILE_IMAGE(HttpStatus.BAD_REQUEST, "프로필 사진으로 쓸 수 없는 파일입니다.");

	private final HttpStatus status;
	private final String message;

	UserErrorCode(HttpStatus status, String message) {
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
