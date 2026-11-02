package com.eodilog.trip.exception;

import com.eodilog.global.common.error.ErrorCode;
import org.springframework.http.HttpStatus;

public enum TripErrorCode implements ErrorCode {

	// 존재를 공개할 수 없는 여행(비참여·이탈·삭제)도 같은 응답을 쓴다(명세 §2, P-10)
	TRIP_NOT_FOUND(HttpStatus.NOT_FOUND, "여행을 찾을 수 없습니다."),
	// 다른 여행의 멤버십·이미 나간 멤버도 같은 응답을 쓴다
	MEMBER_NOT_FOUND(HttpStatus.NOT_FOUND, "동행을 찾을 수 없습니다."),
	// 다른 멤버가 먼저 수정했다. 덮어쓰지 않고 다시 조회하게 한다(명세 §2)
	VERSION_CONFLICT(HttpStatus.CONFLICT, "여행 정보가 변경되었습니다. 다시 조회해 주세요."),
	// 혼자 남은 방장의 나가기는 여행 삭제와 같다. 여행 삭제 기능이 생기기 전까지 막는다(정책 §11 L-4)
	TRIP_DELETION_PENDING(HttpStatus.CONFLICT, "혼자 남은 여행은 아직 나갈 수 없습니다. 여행 삭제 기능을 준비 중입니다.");

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
