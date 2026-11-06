package com.eodilog.global.storage;

import java.io.InputStream;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;

// 파일 바이트를 두는 객체 저장소. 운영은 S3(S3ObjectStorage), 테스트는 메모리 구현으로 바꿔 끼운다
// DB 트랜잭션 안에서 부르지 않는다(외부 I/O)
public interface ObjectStorage {

	// 클라이언트가 직접 PUT할 서명 URL. headers는 PUT 때 그대로 보내야 하는 헤더다(서명에 포함됨)
	PresignedUpload presignUpload(String key, String contentType, long byteSize, Duration ttl);

	// 객체가 없으면 빈 값
	Optional<StoredObject> head(String key);

	// 앞부분 최대 length바이트. 실제 파일 형식(시그니처) 검사용
	byte[] readPrefix(String key, int length);

	// 본문 스트림. 호출한 쪽이 닫는다
	InputStream open(String key);

	// 없는 객체를 지워도 실패하지 않는다
	void delete(String key);

	record PresignedUpload(String url, String method, Map<String, String> headers, Instant expiresAt) {
	}

	record StoredObject(long byteSize, String contentType) {
	}

}
