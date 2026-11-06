package com.eodilog.global.ai;

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

}
