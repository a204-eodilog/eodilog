package com.eodilog.visit.candidate;

import com.eodilog.global.common.error.ErrorCode;
import org.springframework.http.HttpStatus;

public enum VisitCandidateErrorCode implements ErrorCode {

	// 없는 후보·다른 여행의 후보·다른 멤버의 후보는 같은 응답을 쓴다
	VISIT_CANDIDATE_NOT_FOUND(HttpStatus.NOT_FOUND, "방문 후보를 찾을 수 없습니다."),

	// 근거 사진이 이동·삭제됐거나 같은 장소의 다른 후보가 먼저 확정됐다
	VISIT_CANDIDATE_INVALIDATED(HttpStatus.CONFLICT, "더 이상 확정할 수 없는 방문 후보입니다."),

	VERSION_CONFLICT(HttpStatus.CONFLICT, "방문 후보가 변경되었습니다. 다시 조회해 주세요."),

	AI_FEATURE_DISABLED(HttpStatus.CONFLICT, "방문 감지 설정이 꺼져 있습니다.");

	private final HttpStatus status;
	private final String message;

	VisitCandidateErrorCode(HttpStatus status, String message) {
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
