package com.eodilog.global.ai;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

// 내부 AI 서버 연결 설정(ai/docs/spec.md §1). 토큰은 비워 둘 수 있다. 비면 헤더를 보내지 않고 AI 서버가 401로 거부한다
// 시간 예산(AI spec §1.0): AI 서버 45초 < 백엔드 호출 50초 < jobs 작업 60초. 연결 시간까지 더해도 작업 제한 안에 끝나야 한다
// application.yaml을 읽지 않는 설정(spring.config.name을 바꾼 테스트 등)에서도 서버가 뜨도록 기본값을 둔다
@Validated
@ConfigurationProperties("app.ai")
public record AiServerProperties(
		@NotBlank @DefaultValue("http://localhost:8000") String baseUrl,
		String internalToken,
		@NotNull @DefaultValue("5s") Duration connectTimeout,
		@NotNull @DefaultValue("50s") Duration readTimeout) {

	public AiServerProperties {
		if (connectTimeout != null && (connectTimeout.isNegative() || connectTimeout.isZero())) {
			throw new IllegalArgumentException("Invalid AI connect timeout");
		}
		if (readTimeout != null && (readTimeout.isNegative() || readTimeout.isZero())) {
			throw new IllegalArgumentException("Invalid AI read timeout");
		}
		internalToken = internalToken == null ? "" : internalToken.strip();
	}

}
