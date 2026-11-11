package com.eodilog.facility.ev;

/** 충전소 정보 API를 쓸 수 없다. 문구에 인증키나 요청 주소를 넣지 않는다 */
public class EvChargerUnavailableException extends RuntimeException {

	public EvChargerUnavailableException(String message) {
		super(message);
	}

}
