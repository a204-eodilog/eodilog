package com.eodilog.checklist.exception;

import com.eodilog.global.common.error.ErrorCode;
import org.springframework.http.HttpStatus;

public enum ChecklistErrorCode implements ErrorCode {

	// 다른 여행의 항목·삭제된 항목도 같은 응답을 쓴다
	CHECKLIST_ITEM_NOT_FOUND(HttpStatus.NOT_FOUND, "준비물을 찾을 수 없습니다."),
	// 다른 멤버가 먼저 수정했다. 덮어쓰지 않고 다시 조회하게 한다(명세 §2)
	VERSION_CONFLICT(HttpStatus.CONFLICT, "준비물이 변경되었습니다. 다시 조회해 주세요.");

	private final HttpStatus status;
	private final String message;

	ChecklistErrorCode(HttpStatus status, String message) {
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
