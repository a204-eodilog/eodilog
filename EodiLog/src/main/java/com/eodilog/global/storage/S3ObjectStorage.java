package com.eodilog.global.storage;

import java.io.InputStream;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PresignedPutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

// 비공개 버킷 하나에 객체를 둔다. 공개 URL은 만들지 않고, 업로드는 짧은 서명 URL, 다운로드는 서버 전달로만 한다
public class S3ObjectStorage implements ObjectStorage {

	private static final int NOT_FOUND = 404;
	private static final int RANGE_NOT_SATISFIABLE = 416;

	private final S3Client s3Client;
	private final S3Presigner presigner;
	private final String bucket;

	public S3ObjectStorage(S3Client s3Client, S3Presigner presigner, String bucket) {
		this.s3Client = s3Client;
		this.presigner = presigner;
		this.bucket = bucket;
	}

	@Override
	public PresignedUpload presignUpload(String key, String contentType, long byteSize, Duration ttl) {
		PutObjectRequest put = PutObjectRequest.builder()
				.bucket(bucket)
				.key(key)
				.contentType(contentType)
				.contentLength(byteSize)
				.build();
		PresignedPutObjectRequest presigned = presigner.presignPutObject(PutObjectPresignRequest.builder()
				.signatureDuration(ttl)
				.putObjectRequest(put)
				.build());
		// Host는 URL에 들어 있고 HTTP 클라이언트가 붙이므로 앱에 넘기지 않는다
		Map<String, String> headers = new LinkedHashMap<>();
		presigned.signedHeaders().forEach((name, values) -> {
			if (!"host".equalsIgnoreCase(name)) {
				headers.put(name, String.join(",", values));
			}
		});
		return new PresignedUpload(presigned.url().toString(), "PUT", Map.copyOf(headers), presigned.expiration());
	}

	@Override
	public Optional<StoredObject> head(String key) {
		try {
			HeadObjectResponse response = s3Client.headObject(HeadObjectRequest.builder().bucket(bucket).key(key).build());
			return Optional.of(new StoredObject(response.contentLength(), response.contentType()));
		} catch (S3Exception ex) {
			if (ex.statusCode() == NOT_FOUND) {
				return Optional.empty();
			}
			throw ex;
		}
	}

	@Override
	public byte[] readPrefix(String key, int length) {
		try {
			ResponseBytes<GetObjectResponse> bytes = s3Client.getObjectAsBytes(GetObjectRequest.builder()
					.bucket(bucket).key(key).range("bytes=0-" + (length - 1)).build());
			return bytes.asByteArray();
		} catch (S3Exception ex) {
			// 0바이트 객체는 범위 요청이 416이다
			if (ex.statusCode() == RANGE_NOT_SATISFIABLE) {
				return new byte[0];
			}
			throw ex;
		}
	}

	@Override
	public InputStream open(String key) {
		return s3Client.getObject(GetObjectRequest.builder().bucket(bucket).key(key).build());
	}

	@Override
	public void delete(String key) {
		s3Client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build());
	}

}
