package com.eodilog.facility.ev;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

/**
 * 한국환경공단 전기자동차 충전소 정보 API(data.go.kr) 연결·갱신 설정(EODI-304).
 * 키가 비어 있으면 서버는 뜨고 갱신만 하지 않는다. 충전소 조회는 첫 적재 전이라 503이 된다.
 *
 * <p>호출량: 5분마다 변경분 1번(하루 약 288번) + 전국 수신 1번당 53번(53만 대 ÷ 9,999). 전국 수신은 하루
 * {@code maxFullRefreshesPerDay}번까지만 한다. 변경분은 최근 {@code statusPeriodMinutes}분(5분 간격보다 1분 길게 겹쳐 빈틈을 막는다. 7분이면 낮 시간에 9,999건을 넘어 두 번 부르게 된다)
 */
@Validated
@ConfigurationProperties("app.facilities.ev")
public record EvChargerProperties(
		String serviceKey,
		@NotBlank @DefaultValue("https://apis.data.go.kr/B552584/EvCharger") String baseUrl,
		@DefaultValue("true") boolean syncEnabled,
		@Min(10) @Max(9999) @DefaultValue("9999") int pageSize,
		@Min(1) @Max(10) @DefaultValue("6") int statusPeriodMinutes,
		@NotNull @DefaultValue("5m") Duration statusInterval,
		@Min(1) @DefaultValue("3") int statusAttempts,
		@NotNull @DefaultValue("30s") Duration statusRetryDelay,
		@NotNull @DefaultValue("10m") Duration gapLimit,
		@NotNull @DefaultValue("20m") Duration staleAfter,
		@Min(1) @DefaultValue("4") int maxFullRefreshesPerDay,
		@NotBlank @DefaultValue("0 0 4 * * *") String fullRefreshCron,
		@NotNull @DefaultValue("30m") Duration lease,
		@NotNull @DefaultValue("5s") Duration connectTimeout,
		@NotNull @DefaultValue("60s") Duration readTimeout) {

	public EvChargerProperties {
		serviceKey = serviceKey == null ? "" : serviceKey.strip();
	}

	public boolean hasKey() {
		return !serviceKey.isEmpty();
	}

}
