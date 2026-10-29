package com.eodilog.trip.exception;

import com.eodilog.global.common.error.ErrorCode;
import org.springframework.http.HttpStatus;

public enum TripErrorCode implements ErrorCode {

	// 존재를 공개할 수 없는 여행(비참여·이탈·삭제)도 같은 응답을 쓴다(명세 §2, P-10)
	TRIP_NOT_FOUND(HttpStatus.NOT_FOUND, "여행을 찾을 수 없습니다.");

	private final HttpStatus status;
	private final String message;

	TripErrorCode(HttpStatus status, String message) {
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
