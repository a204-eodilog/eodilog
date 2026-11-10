package com.eodilog.extraction;

import com.eodilog.global.common.error.ErrorCode;
import org.springframework.http.HttpStatus;

// 장소 추출 업무 오류(명세 §2·§5). 코드 이름은 다른 도메인과 같은 값을 쓴다
public enum ExtractionErrorCode implements ErrorCode {

	// 캡처 11장 이상(명세 §5). AI 서버도 같은 한도다(AI spec §2)
	INPUT_LIMIT_EXCEEDED(HttpStatus.UNPROCESSABLE_ENTITY, "캡처는 한 번에 10장까지 보낼 수 있습니다."),
	// 내 장소 추출 설정이 꺼져 있다(명세 §3 기능 설정)
	AI_FEATURE_DISABLED(HttpStatus.CONFLICT, "장소 추출 설정이 꺼져 있습니다. 설정에서 켠 뒤 다시 시도해 주세요.");

	private final HttpStatus status;
	private final String message;

	ExtractionErrorCode(HttpStatus status, String message) {
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
