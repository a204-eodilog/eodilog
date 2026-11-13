package com.eodilog.job;

/** Only these server-owned values can be persisted or returned as failures. */
public enum JobFailure {
    VOICE_AUDIO_INVALID("녹음 파일을 확인해 주세요.", false),
    VOICE_INPUT_LIMIT_EXCEEDED("음성 입력 한도를 초과했습니다.", false),
    VOICE_NO_SPEECH_OR_EXPENSE("경비를 인식하지 못했습니다. 다시 녹음해 주세요.", false),
    VOICE_EXPENSE_UNSUPPORTED("원화 균등 분담 경비만 지원합니다.", false),
    VOICE_PROVIDER_UNAVAILABLE("음성 분석 서버에 연결하지 못했습니다.", false),
    VOICE_PROCESSING_TIMEOUT("음성 분석 시간이 초과되었습니다.", false),
    VOICE_PROCESSING_INTERRUPTED("음성 분석이 중단됐습니다. 다시 녹음해 주세요.", false),
    INSUFFICIENT_DATA("취향을 추론할 저장 장소가 부족합니다.", false),
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
