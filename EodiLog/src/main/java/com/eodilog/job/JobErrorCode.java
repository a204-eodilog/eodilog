package com.eodilog.job;

import com.eodilog.global.common.error.ErrorCode;
import org.springframework.http.HttpStatus;

public enum JobErrorCode implements ErrorCode {
    JOB_NOT_FOUND;
    public HttpStatus status() { return HttpStatus.NOT_FOUND; }
    public String code() { return name(); }
    public String message() { return "작업을 찾을 수 없습니다."; }
}
