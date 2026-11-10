package com.eodilog.weather;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

// 기상청 단기·중기예보(data.go.kr) 연결 설정(정책 W-1·W-5). 키가 비어도 서버는 뜨고 날씨 요청만 503이 된다
// stale-limit: 공급자 장애 때 직전 성공 응답을 stale=true로 돌려줄 수 있는 최대 경과 시간(W-7)
@Validated
@ConfigurationProperties("app.weather")
public record WeatherProperties(
		String serviceKey,
		@NotBlank @DefaultValue("https://apis.data.go.kr/1360000") String baseUrl,
		@NotNull @DefaultValue("3s") Duration connectTimeout,
		@NotNull @DefaultValue("5s") Duration readTimeout,
		@NotNull @DefaultValue("6h") Duration staleLimit) {

	public WeatherProperties {
		serviceKey = serviceKey == null ? "" : serviceKey.strip();
	}

	public boolean hasKey() {
		return !serviceKey.isEmpty();
	}

}
