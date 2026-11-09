package com.eodilog.global.storage;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

// 테스트용 저장소. 서명 URL 대신 memory:// 주소를 주고, 테스트가 put으로 앱의 업로드를 흉내 낸다
public class InMemoryObjectStorage implements ObjectStorage {

	private record Stored(byte[] bytes, String contentType) {
	}

	private final Map<String, Stored> objects = new ConcurrentHashMap<>();

	@Override
	public PresignedUpload presignUpload(String key, String contentType, long byteSize, Duration ttl) {
		return new PresignedUpload("memory://test-bucket/" + key, "PUT",
				Map.of("content-type", contentType, "content-length", Long.toString(byteSize)),
				Instant.parse("2026-11-06T00:10:00Z"));
	}

	@Override
	public Optional<StoredObject> head(String key) {
		return Optional.ofNullable(objects.get(key)).map(stored -> new StoredObject(stored.bytes().length,
				stored.contentType()));
	}

	@Override
	public byte[] readPrefix(String key, int length) {
		Stored stored = objects.get(key);
		if (stored == null) {
			throw new IllegalStateException("없는 객체: " + key);
		}
		return Arrays.copyOf(stored.bytes(), Math.min(length, stored.bytes().length));
	}

	@Override
	public InputStream open(String key) {
		Stored stored = objects.get(key);
		if (stored == null) {
			throw new IllegalStateException("없는 객체: " + key);
		}
		return new ByteArrayInputStream(stored.bytes());
	}

	@Override
	public void delete(String key) {
		objects.remove(key);
	}

	// 앱이 서명 URL로 올린 것처럼 넣는다
	public void put(String key, byte[] bytes, String contentType) {
		objects.put(key, new Stored(bytes.clone(), contentType));
	}

	@Override public void write(String key, byte[] bytes, String contentType) { put(key, bytes, contentType); }

	public boolean contains(String key) {
		return objects.containsKey(key);
	}

}
