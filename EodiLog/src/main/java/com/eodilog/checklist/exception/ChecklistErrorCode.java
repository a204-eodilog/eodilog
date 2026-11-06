package com.eodilog.checklist.exception;

import com.eodilog.global.common.error.ErrorCode;
import org.springframework.http.HttpStatus;

public enum ChecklistErrorCode implements ErrorCode {

	// 다른 여행의 항목·삭제된 항목도 같은 응답을 쓴다
	CHECKLIST_ITEM_NOT_FOUND(HttpStatus.NOT_FOUND, "준비물을 찾을 수 없습니다."),
	// 다른 멤버가 먼저 수정했다. 덮어쓰지 않고 다시 조회하게 한다(명세 §2)
	VERSION_CONFLICT(HttpStatus.CONFLICT, "준비물이 변경되었습니다. 다시 조회해 주세요."),
	// 내 준비물 추천 설정이 꺼져 있다. 명시적 요청·채택도 막고 설정을 켜도록 안내한다(명세 §3 기능 설정)
	AI_FEATURE_DISABLED(HttpStatus.CONFLICT, "준비물 추천 설정이 꺼져 있습니다. 설정에서 켠 뒤 다시 시도해 주세요."),
	// 같은 제안(작업·순번)은 한 번만 채택한다. 채택 후 지운 제안도 다시 채택하지 않는다(정책 S-11)
	SUGGESTION_ALREADY_ADOPTED(HttpStatus.CONFLICT, "이미 추가한 준비물 제안입니다. 목록을 다시 조회해 주세요.");

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
