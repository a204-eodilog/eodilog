package com.eodilog.global.common.error;

import com.eodilog.global.common.trace.TraceIdFilter;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

// 컨트롤러 밖(Security 필터·AuthenticationEntryPoint·AccessDeniedHandler)에서 공통 실패 형식을 쓰기 위한 도우미
@Component
@RequiredArgsConstructor
public class ErrorResponseWriter {

	private final JsonMapper jsonMapper;

	public void write(HttpServletResponse response, ErrorCode errorCode) throws IOException {
		response.setStatus(errorCode.status().value());
		response.setContentType(MediaType.APPLICATION_JSON_VALUE);
		response.setCharacterEncoding(StandardCharsets.UTF_8.name());
		jsonMapper.writeValue(response.getOutputStream(), ErrorResponse.of(errorCode, TraceIdFilter.currentTraceId()));
	}

}
