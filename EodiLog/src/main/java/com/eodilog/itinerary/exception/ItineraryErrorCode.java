package com.eodilog.itinerary.exception;

import com.eodilog.global.common.error.ErrorCode;
import org.springframework.http.HttpStatus;

public enum ItineraryErrorCode implements ErrorCode {

	// 다른 멤버가 먼저 바꾼 코스를 덮어쓰지 않는다. 최신 코스를 다시 조회하게 한다(C-6)
	VERSION_CONFLICT(HttpStatus.CONFLICT, "코스가 변경되었습니다. 다시 조회해 주세요."),
	// 구간이 같은 날짜의 인접한 항목 쌍마다 하나씩 있어야 한다. 빠지거나 겹치거나 인접하지 않으면 거부한다(C-4)
	INVALID_ROUTE_LEGS(HttpStatus.UNPROCESSABLE_CONTENT,
			"구간이 코스 항목과 맞지 않습니다. 같은 날짜의 인접한 장소마다 구간을 하나씩 보내 주세요."),
	// AI 코스 제안(정책 I-5·I-6). 기간이 없거나 모은 장소가 없으면 작업을 만들지 않는다. fields로 무엇이 없는지 알린다
	INSUFFICIENT_DATA(HttpStatus.UNPROCESSABLE_CONTENT, "코스를 만들려면 여행 기간과 모은 장소가 필요합니다."),
	INPUT_LIMIT_EXCEEDED(HttpStatus.UNPROCESSABLE_CONTENT, "코스를 짤 장소는 200곳까지 보낼 수 있습니다."),
	// 같은 제안은 한 번만 적용한다(I-20)
	ALREADY_APPLIED(HttpStatus.CONFLICT, "이미 적용한 제안입니다. 코스를 다시 조회해 주세요."),
	// 진행 중·실패·취소된 제안은 적용할 수 없다(I-17)
	PROPOSAL_NOT_READY(HttpStatus.CONFLICT, "아직 적용할 수 있는 제안이 아닙니다."),
	// 날씨 대안 중 INFO(안내만)는 코스를 바꿀 수 없다(정책 W-25)
	UNSCHEDULABLE_ALTERNATIVE(HttpStatus.UNPROCESSABLE_CONTENT, "코스를 바꿀 수 없는 안내용 대안입니다."),
	// 직전 AI 적용이 아니거나 그 뒤 코스가 바뀌었다(I-21)
	UNDO_UNAVAILABLE(HttpStatus.CONFLICT, "되돌릴 수 있는 AI 적용이 없습니다. 코스를 다시 조회해 주세요.");

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
