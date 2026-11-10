package com.eodilog.global.ai;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import tools.jackson.databind.JsonNode;

// jobs 실행기가 내부 AI 서버를 부르는 통로. 응답 봉투 {data}를 벗긴 객체를 돌려준다
public interface AiServerClient {

	/**
	 * @param path    `/ai/v1/...` 경로
	 * @param traceId 작업 ID. `X-Trace-Id`로 보내 AI 로그와 백엔드 작업을 잇는다
	 * @throws AiServerException 호출 실패. {@link AiServerException#retryable()}로 일시 실패를 구분한다
	 */
	JsonNode post(String path, UUID traceId, JsonNode body);

	/**
	 * 파일을 함께 보내는 multipart 호출(AI spec §1: 사진·캡처). 실패 분류는 {@link #post}와 같다
	 *
	 * @param fields 문자열 필드. 값이 null인 항목은 보내지 않는다. UTF-8로 보낸다
	 * @param files  파일 필드. 같은 이름을 여러 번 넣으면 같은 필드의 여러 파일이 된다
	 */
	default JsonNode postMultipart(String path, UUID traceId, Map<String, String> fields, List<FilePart> files) {
		throw new AiServerException(false);
	}

	/** 사진 분류용 meta/files. 파일은 동기 호출 종료까지 호출자가 유지하고 정리한다. */
	default JsonNode postMultipart(String path, UUID traceId, JsonNode meta, List<MultipartFile> files) {
		throw new AiServerException(false);
	}

	/** 최대50장 사진을 메모리 byte[] 목록으로 모으지 않는 디스크 기반 전송. */
	default JsonNode postMultipart(String path, UUID traceId, Map<String, String> fields,
			String fileFieldName, List<MultipartFile> files) {
		throw new AiServerException(false);
	}

	record MultipartFile(Path path, String contentType) {
		public MultipartFile { Objects.requireNonNull(path); Objects.requireNonNull(contentType); }
	}

	// multipart 파일 한 개. 바이트는 호출이 끝날 때까지만 쓴다
	record FilePart(String field, String filename, String contentType, byte[] bytes) {

		public FilePart {
			Objects.requireNonNull(field);
			Objects.requireNonNull(filename);
			Objects.requireNonNull(contentType);
			Objects.requireNonNull(bytes);
		}

	}

}
