package com.eodilog.weather;

import com.eodilog.global.common.error.ErrorCode;
import org.springframework.http.HttpStatus;

public enum WeatherErrorCode implements ErrorCode {

	// 지난 날짜, 10일 뒤를 넘는 날짜, 국내 예보 격자 밖 장소(W-2·W-3). 데이터를 지어내지 않고 거부한다
	WEATHER_NOT_AVAILABLE(HttpStatus.UNPROCESSABLE_CONTENT, "이 날짜와 장소의 날씨 예보가 없습니다. 오늘부터 10일 뒤까지만 볼 수 있습니다."),
	// 공급자 장애·시간 초과·키 없음. 결과 없음과 구분한다(명세 §2)
	PROVIDER_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "날씨 정보를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요."),
	// 요청자(또는 적용하는 사람)의 날씨 대안 설정이 OFF(W-12·W-25·W-28)
	AI_FEATURE_DISABLED(HttpStatus.CONFLICT, "날씨 대안 설정이 꺼져 있습니다. 설정에서 켠 뒤 다시 시도해 주세요."),
	// 여행 기간이 없거나 그 날짜 코스에 대상 장소가 없다(W-12). fields로 무엇이 없는지 알린다
	INSUFFICIENT_DATA(HttpStatus.UNPROCESSABLE_CONTENT, "날씨 대안을 만들려면 여행 기간과 그 날짜 코스의 장소가 필요합니다.");

	private final HttpStatus status;
	private final String message;

	WeatherErrorCode(HttpStatus status, String message) {
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
