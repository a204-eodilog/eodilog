package com.eodilog.asset;

import com.eodilog.global.common.error.ErrorCode;
import org.springframework.http.HttpStatus;

public enum AssetErrorCode implements ErrorCode {
    ASSET_NOT_FOUND(HttpStatus.NOT_FOUND, "파일을 찾을 수 없습니다."),
    ASSET_NOT_READY(HttpStatus.CONFLICT, "이용할 수 있는 파일 상태가 아닙니다."),
    UPLOAD_EXPIRED(HttpStatus.GONE, "업로드 기한이 지났습니다."),
    INVALID_ASSET(HttpStatus.UNPROCESSABLE_ENTITY, "파일의 크기 또는 이미지 형식이 올바르지 않습니다."),
    UNSUPPORTED_INPUT(HttpStatus.UNPROCESSABLE_ENTITY, "지원하지 않는 파일 형식 또는 용도입니다."),
    INPUT_LIMIT_EXCEEDED(HttpStatus.UNPROCESSABLE_ENTITY, "업로드 한도를 초과했습니다."),
    STORAGE_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "파일 저장소를 이용할 수 없습니다."),
    IMAGE_PROCESSOR_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "이미지 변환기를 이용할 수 없습니다.");

    private final HttpStatus status;
    private final String message;
    AssetErrorCode(HttpStatus status, String message) { this.status = status; this.message = message; }
    public HttpStatus status() { return status; }
    public String code() { return name(); }
    public String message() { return message; }
}
