package com.eodilog.invitation.exception;

import com.eodilog.global.common.error.ErrorCode;
import org.springframework.http.HttpStatus;

public enum InvitationErrorCode implements ErrorCode {

	// 없는 토큰·만료·취소·삭제된 여행·초대한 사람이 나간 경우를 구분하지 않는다(명세 §2 410)
	INVITATION_EXPIRED(HttpStatus.GONE, "만료되었거나 사용할 수 없는 초대 링크입니다."),
	// 여행당 ACTIVE 멤버 상한(Q-4)에 닿았다
	TRIP_FULL(HttpStatus.CONFLICT, "여행 인원이 가득 찼습니다.");

	private final HttpStatus status;
	private final String message;

	InvitationErrorCode(HttpStatus status, String message) {
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
