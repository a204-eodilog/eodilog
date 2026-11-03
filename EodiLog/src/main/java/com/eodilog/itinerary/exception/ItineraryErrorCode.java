package com.eodilog.itinerary.exception;

import com.eodilog.global.common.error.ErrorCode;
import org.springframework.http.HttpStatus;

public enum ItineraryErrorCode implements ErrorCode {

	// 다른 멤버가 먼저 바꾼 코스를 덮어쓰지 않는다. 최신 코스를 다시 조회하게 한다(C-6)
	VERSION_CONFLICT(HttpStatus.CONFLICT, "코스가 변경되었습니다. 다시 조회해 주세요."),
	// 구간이 같은 날짜의 인접한 항목 쌍마다 하나씩 있어야 한다. 빠지거나 겹치거나 인접하지 않으면 거부한다(C-4)
	INVALID_ROUTE_LEGS(HttpStatus.UNPROCESSABLE_CONTENT,
			"구간이 코스 항목과 맞지 않습니다. 같은 날짜의 인접한 장소마다 구간을 하나씩 보내 주세요.");

	private final HttpStatus status;
	private final String message;

	ItineraryErrorCode(HttpStatus status, String message) {
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
