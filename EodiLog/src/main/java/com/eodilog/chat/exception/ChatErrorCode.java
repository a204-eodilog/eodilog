package com.eodilog.chat.exception;

import com.eodilog.global.common.error.ErrorCode;
import org.springframework.http.HttpStatus;

public enum ChatErrorCode implements ErrorCode {

	// 없는 방·삭제된 여행의 방·참여하지 않았거나 나간 방을 구분하지 않는다(여행 404와 같은 원칙)
	CHAT_ROOM_NOT_FOUND(HttpStatus.NOT_FOUND, "채팅방을 찾을 수 없습니다."),
	// 같은 clientMessageId를 다른 방이나 다른 본문에 다시 썼다
	CLIENT_MESSAGE_ID_REUSED(HttpStatus.CONFLICT, "이미 다른 메시지에 쓴 clientMessageId입니다.");

	private final HttpStatus status;
	private final String message;

	ChatErrorCode(HttpStatus status, String message) {
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
