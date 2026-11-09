package com.eodilog;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

// 스프링 컨텍스트를 띄우는 테스트는 이 설정을 @Import해 compose.yaml과 같은 PostGIS 이미지로 DB를 연결한다
// 컨텍스트가 여러 개여도 컨테이너는 JVM당 하나만 띄워 새 소켓·기동 시간을 줄인다. JVM이 끝나면 Testcontainers가 정리한다
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

	static final DockerImageName POSTGIS_IMAGE = DockerImageName.parse("postgis/postgis:17-3.5")
			.asCompatibleSubstituteFor("postgres");

	// 캐시된 테스트 컨텍스트마다 커넥션 풀(기본 10개)을 들고 있어 기본 상한 100개를 넘으면 다음 컨텍스트가
	// "too many clients"로 뜨지 못한다. 컨텍스트가 늘어도 버티게 상한을 올린다(fsync=off는 Testcontainers 기본값 유지)
	private static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(POSTGIS_IMAGE)
			.withCommand("postgres", "-c", "fsync=off", "-c", "max_connections=300");

	// 한 컨텍스트가 닫힐 때 공유 컨테이너를 멈추지 않도록 종료 메서드를 끈다
	@Bean(destroyMethod = "")
	@ServiceConnection
	PostgreSQLContainer postgresContainer() {
		return POSTGRES;
	}

}
