package com.eodilog.facility;

import com.eodilog.global.common.error.ErrorCode;
import org.springframework.http.HttpStatus;

public enum FacilityErrorCode implements ErrorCode {

	// 충전소 첫 적재 전(키 없음·적재 중·실패), 화장실 자료를 넣지 않음. 결과 없음(빈 목록)과 구분한다(명세 §2, WD-FR-18)
	FACILITY_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "편의시설 정보를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.");

	private final HttpStatus status;
	private final String message;

	FacilityErrorCode(HttpStatus status, String message) {
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
