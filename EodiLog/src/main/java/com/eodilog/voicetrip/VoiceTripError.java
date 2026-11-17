package com.eodilog.voicetrip;

import com.eodilog.global.common.error.ErrorCode;
import org.springframework.http.HttpStatus;

// 말로 여행 만들기(실험) 오류. AI 서버가 돌려준 4xx 중 사용자에게 보여 줄 것만 이 코드로 넘긴다
public enum VoiceTripError implements ErrorCode {

	INPUT_LIMIT_EXCEEDED(HttpStatus.UNPROCESSABLE_ENTITY, "녹음이 너무 길거나 큽니다."),
	INSUFFICIENT_DATA(HttpStatus.UNPROCESSABLE_ENTITY, "말소리를 듣지 못했어요."),
	AI_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "말로 만들기를 지금 쓸 수 없어요. 잠시 후 다시 시도해 주세요.");

	private final HttpStatus status;
	private final String message;

	VoiceTripError(HttpStatus status, String message) {
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
