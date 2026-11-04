package com.eodilog.global.websocket;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorCode;
import com.eodilog.global.common.error.ExceptionDiagnostics;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.Message;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.StompSubProtocolErrorHandler;

// 클라이언트 프레임 처리 실패(인증·구독 거부 등)를 REST와 같은 오류 형식의 ERROR 프레임으로 바꾼다
// 업무 오류는 그 코드로, 예상하지 못한 예외는 내부 문구 없이 INTERNAL_ERROR로 알리고 로그만 남긴다
@Slf4j
@Component
@RequiredArgsConstructor
public class StompErrorHandler extends StompSubProtocolErrorHandler {

	private final StompErrors stompErrors;

	@Override
	public Message<byte[]> handleClientMessageProcessingError(Message<byte[]> clientMessage, Throwable ex) {
		ErrorCode errorCode = businessErrorCode(ex);
		String traceId = StompErrors.newTraceId();
		if (errorCode == null) {
			errorCode = CommonErrorCode.INTERNAL_ERROR;
			log.error("STOMP failure traceId={} code=INTERNAL_ERROR diagnostics={}", traceId,
					ExceptionDiagnostics.summarize(ex));
		}
		return stompErrors.error(errorCode, traceId, null);
	}

	// 인터셉터에서 던진 예외는 MessageDeliveryException으로 감싸여 온다
	private static ErrorCode businessErrorCode(Throwable ex) {
		for (Throwable cause = ex; cause != null; cause = cause.getCause()) {
			if (cause instanceof BusinessException business) {
				return business.getErrorCode();
			}
		}
		return null;
	}

}
