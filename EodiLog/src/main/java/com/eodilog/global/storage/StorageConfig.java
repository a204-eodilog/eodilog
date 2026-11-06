package com.eodilog.global.storage;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import java.net.URI;
import java.time.Duration;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.checksums.RequestChecksumCalculation;
import software.amazon.awssdk.core.checksums.ResponseChecksumValidation;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

// S3 클라이언트는 만들 때 네트워크에 붙지 않는다. 자격 증명은 첫 요청 때 확인하므로 키 없는 테스트도 뜬다
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(StorageProperties.class)
public class StorageConfig {

	@Bean(destroyMethod = "close")
	S3Client s3Client(StorageProperties properties) {
		var builder = S3Client.builder()
				.region(Region.of(properties.region()))
				.credentialsProvider(credentials(properties))
				// 체크섬은 S3가 요구할 때만 계산한다. 앱이 직접 올리는 서명 URL에 SDK 전용 체크섬 조건이 붙지 않게 한다
				.requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED)
				.responseChecksumValidation(ResponseChecksumValidation.WHEN_REQUIRED)
				.overrideConfiguration(b -> b.apiCallTimeout(Duration.ofSeconds(30)).apiCallAttemptTimeout(Duration.ofSeconds(10)));
		if (properties.endpoint() != null && !properties.endpoint().isBlank()) {
			builder.endpointOverride(URI.create(properties.endpoint()));
			builder.serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build());
		}
		return builder.build();
	}

	@Bean(destroyMethod = "close")
	S3Presigner s3Presigner(StorageProperties properties, S3Client s3Client) {
		var builder = S3Presigner.builder()
				.region(Region.of(properties.region()))
				.credentialsProvider(credentials(properties))
				.s3Client(s3Client);
		if (properties.endpoint() != null && !properties.endpoint().isBlank()) {
			builder.endpointOverride(URI.create(properties.endpoint()));
			builder.serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build());
		}
		return builder.build();
	}

	@Bean
	ObjectStorage objectStorage(S3Client s3Client, S3Presigner s3Presigner, StorageProperties properties) {
		return new S3ObjectStorage(s3Client, s3Presigner, properties.bucket());
	}

	private static AwsCredentialsProvider credentials(StorageProperties properties) {
		if (properties.hasStaticCredentials()) {
			return StaticCredentialsProvider.create(
					AwsBasicCredentials.create(properties.accessKeyId(), properties.secretAccessKey()));
		}
		return DefaultCredentialsProvider.builder().build();
	}

}
