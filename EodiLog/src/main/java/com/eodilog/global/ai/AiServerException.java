package com.eodilog.global.ai;

// AI 서버 호출 실패. 원문 응답·예외 문구는 담지 않는다(입력·토큰이 섞일 수 있다)
// retryable: 5xx·연결 실패·타임아웃(TEMPORARY_FAILURE), 그 밖의 4xx·응답 형식 오류는 재시도하지 않는다(AI spec §1.0)
public class AiServerException extends RuntimeException {

	private final boolean retryable;
	private int status;
	private String providerCode;
	private boolean timedOut;

	public AiServerException(boolean retryable) {
		super(retryable ? "AI server temporarily unavailable" : "AI server rejected the request");
		this.retryable = retryable;
	}

	public boolean retryable() {
		return retryable;
	}
	public AiServerException(boolean retryable, boolean timedOut) {
		this(retryable);
		this.timedOut = timedOut;
	}
	public boolean timedOut() { return timedOut; }
	public AiServerException(int status, String providerCode) {
		this(status >= 500);
		this.status = status;
		this.providerCode = java.util.Set.of("VALIDATION_ERROR", "INPUT_LIMIT_EXCEEDED", "INSUFFICIENT_DATA",
				"VOICE_EXPENSE_UNSUPPORTED", "PROVIDER_UNAVAILABLE").contains(providerCode == null ? "" : providerCode)
				? providerCode : null;
	}
	public int status() { return status; }
	public String providerCode() { return providerCode; }

}
