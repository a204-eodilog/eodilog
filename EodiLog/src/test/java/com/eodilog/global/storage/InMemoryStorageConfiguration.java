package com.eodilog.global.storage;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

// 파일 API 테스트는 실제 S3 대신 이 저장소를 쓴다. @Import해서 쓴다
@TestConfiguration(proxyBeanMethods = false)
public class InMemoryStorageConfiguration {

	@Bean
	@Primary
	InMemoryObjectStorage inMemoryObjectStorage() {
		return new InMemoryObjectStorage();
	}

}
