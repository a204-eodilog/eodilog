package com.eodilog.photo.classification;

import com.eodilog.global.common.error.ErrorCode;
import org.springframework.http.HttpStatus;

public enum ClassificationError implements ErrorCode {
    AI_FEATURE_DISABLED(HttpStatus.CONFLICT, "사진 분류 설정이 꺼져 있습니다."),
    JOB_NOT_FOUND(HttpStatus.NOT_FOUND, "작업을 찾을 수 없습니다."),
    VERSION_CONFLICT(HttpStatus.CONFLICT, "사진 또는 적용 요청이 변경되었습니다.");
    private final HttpStatus status;
    private final String message;
    ClassificationError(HttpStatus status, String message) { this.status=status; this.message=message; }
    public HttpStatus status() { return status; }
    public String code() { return name(); }
    public String message() { return message; }
}
