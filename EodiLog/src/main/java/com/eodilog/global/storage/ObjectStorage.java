package com.eodilog.global.storage;

import java.io.InputStream;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;

// 파일 바이트를 두는 객체 저장소. 운영은 S3(S3ObjectStorage), 테스트는 메모리 구현으로 바꿔 끼운다
// 외부 I/O다. 파일 완료·취소·등록과 이탈/삭제의 순서를 보장하는 호출자는 여행/파일 잠금을 유지한다.
public interface ObjectStorage {

	// Full reads remain bounded even if an untrusted upload disagrees with its declared size.
	default byte[] read(String key, long maxBytes) {
		try {
			var object = head(key).orElseThrow(() -> new com.eodilog.global.common.error.BusinessException(
					com.eodilog.asset.AssetErrorCode.INVALID_ASSET));
			if (object.byteSize() > maxBytes) throw new com.eodilog.global.common.error.BusinessException(
					com.eodilog.asset.AssetErrorCode.INVALID_ASSET);
			try (var input = open(key)) {
				byte[] bytes = input.readNBytes(Math.toIntExact(maxBytes + 1));
				if (bytes.length > maxBytes) throw new com.eodilog.global.common.error.BusinessException(
						com.eodilog.asset.AssetErrorCode.INVALID_ASSET);
				return bytes;
			}
		} catch (com.eodilog.global.common.error.BusinessException ex) { throw ex; }
		catch (Exception ex) { throw new com.eodilog.global.common.error.BusinessException(
				com.eodilog.asset.AssetErrorCode.STORAGE_UNAVAILABLE); }
	}

	// Sanitized display pixels are written to a key clients cannot overwrite with their upload URL.
	void write(String key, byte[] bytes, String contentType);

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
