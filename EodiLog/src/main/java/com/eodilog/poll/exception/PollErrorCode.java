package com.eodilog.poll.exception;

import com.eodilog.global.common.error.ErrorCode;
import org.springframework.http.HttpStatus;

public enum PollErrorCode implements ErrorCode {

	// 다른 여행의 투표도 같은 응답을 쓴다(V-1)
	POLL_NOT_FOUND(HttpStatus.NOT_FOUND, "투표를 찾을 수 없습니다."),
	// 마감 시각이 지났거나 이미 마감한 투표에는 투표·후보 추가를 하지 않는다(V-9)
	POLL_CLOSED(HttpStatus.CONFLICT, "이미 마감된 투표입니다."),
	// 후보가 추가됐거나 마감돼 내가 본 투표와 달라졌다. 덮어쓰지 않고 다시 조회하게 한다(V-8)
	VERSION_CONFLICT(HttpStatus.CONFLICT, "투표가 변경되었습니다. 다시 조회해 주세요.");

	private final HttpStatus status;
	private final String message;

	PollErrorCode(HttpStatus status, String message) {
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
