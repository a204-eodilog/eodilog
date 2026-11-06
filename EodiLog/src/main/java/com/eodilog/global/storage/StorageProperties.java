package com.eodilog.global.storage;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

// 파일 저장소(S3) 설정. 키를 비우면 AWS 기본 자격 증명 체인(EC2 IAM 역할 등)을 쓴다
// 로컬 .env는 Spring 설정으로만 읽히고 OS 환경 변수가 아니라서, 키를 여기로 받아 SDK에 직접 넘긴다
@Validated
@ConfigurationProperties("app.storage")
public record StorageProperties(
		@NotBlank String bucket,
		@NotBlank String region,
		String accessKeyId,
		String secretAccessKey,
		@NotNull Duration uploadUrlTtl,
		String endpoint) {

	private static final Duration DEFAULT_UPLOAD_URL_TTL = Duration.ofMinutes(10);

	public StorageProperties {
		if (uploadUrlTtl == null) {
			uploadUrlTtl = DEFAULT_UPLOAD_URL_TTL;
		}
		// 서명 URL은 SigV4 상한(7일)을 넘을 수 없고, 너무 짧으면 큰 파일 업로드가 끊긴다
		if (uploadUrlTtl.compareTo(Duration.ofMinutes(1)) < 0 || uploadUrlTtl.compareTo(Duration.ofHours(1)) > 0) {
			throw new IllegalArgumentException("app.storage.upload-url-ttl은 1분 이상 1시간 이하여야 합니다.");
		}
		boolean hasKeyId = accessKeyId != null && !accessKeyId.isBlank();
		boolean hasSecret = secretAccessKey != null && !secretAccessKey.isBlank();
		if (hasKeyId != hasSecret) {
			throw new IllegalArgumentException("AWS_ACCESS_KEY_ID와 AWS_SECRET_ACCESS_KEY는 함께 채우거나 함께 비워야 합니다.");
		}
	}

	public boolean hasStaticCredentials() {
		return accessKeyId != null && !accessKeyId.isBlank();
	}

}
