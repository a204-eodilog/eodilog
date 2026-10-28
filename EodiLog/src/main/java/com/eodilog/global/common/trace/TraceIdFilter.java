package com.eodilog.global.common.trace;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

// 요청마다 추적 ID를 만들어 로그(MDC)·응답 헤더·오류 응답 traceId에 같은 값을 쓴다. Security 필터보다 먼저 실행한다
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class TraceIdFilter extends OncePerRequestFilter {

	public static final String HEADER_NAME = "X-Trace-Id";
	public static final String MDC_KEY = "traceId";

	// 요청을 처리 중인 스레드의 추적 ID. 필터 밖이면 null
	public static String currentTraceId() {
		return MDC.get(MDC_KEY);
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
			throws ServletException, IOException {
		// 클라이언트가 보낸 값은 로그 위조에 쓰일 수 있어 받지 않고 서버에서 만든다
		String traceId = UUID.randomUUID().toString().replace("-", "");
		MDC.put(MDC_KEY, traceId);
		response.setHeader(HEADER_NAME, traceId);
		try {
			filterChain.doFilter(request, response);
		} finally {
			MDC.remove(MDC_KEY);
		}
	}

}
