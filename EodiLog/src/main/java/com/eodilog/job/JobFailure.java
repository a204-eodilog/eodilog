package com.eodilog.job;

/** Only these server-owned values can be persisted or returned as failures. */
public enum JobFailure {
    TEMPORARY_FAILURE("일시적인 오류가 발생했습니다.", true),
    TIMEOUT("작업 시간이 초과되었습니다.", true),
    EXECUTION_FAILED("작업을 처리하지 못했습니다.", false),
    POLICY_REVOKED("작업 권한이 변경되었습니다.", false);
    private final String message;
    private final boolean retryable;
    JobFailure(String message, boolean retryable) { this.message = message; this.retryable = retryable; }
    public String message() { return message; }
    public boolean retryable() { return retryable; }
}
