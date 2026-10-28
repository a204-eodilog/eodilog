package com.eodilog.global.config;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class TimeConfig {

	// 현재 시각은 이 빈으로만 얻는다. 테스트에서 시간을 고정할 수 있게 한다
	@Bean
	public Clock clock() {
		return Clock.systemUTC();
	}

}
