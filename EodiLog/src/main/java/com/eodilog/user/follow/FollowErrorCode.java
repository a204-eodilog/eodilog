package com.eodilog.user.follow;

import com.eodilog.global.common.error.ErrorCode;
import org.springframework.http.HttpStatus;

// 팔로우 관계 업무 실패(명세 §3). 대상 회원이 없으면 UserErrorCode.USER_NOT_FOUND
public enum FollowErrorCode implements ErrorCode {

	CANNOT_FOLLOW_SELF(HttpStatus.BAD_REQUEST, "자기 자신은 팔로우할 수 없습니다."),
	// 없는 요청·이미 처리된 요청·당사자가 아닌 요청을 구분하지 않는다
	FOLLOW_REQUEST_NOT_FOUND(HttpStatus.NOT_FOUND, "팔로우 요청을 찾을 수 없습니다.");

	private final HttpStatus status;
	private final String message;

	FollowErrorCode(HttpStatus status, String message) {
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
