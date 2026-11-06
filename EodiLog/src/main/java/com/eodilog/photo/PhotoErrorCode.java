package com.eodilog.photo;

import com.eodilog.global.common.error.ErrorCode;
import org.springframework.http.HttpStatus;

public enum PhotoErrorCode implements ErrorCode {
    PHOTO_BATCH_NOT_FOUND(HttpStatus.NOT_FOUND, "사진 배치를 찾을 수 없습니다."),
    PHOTO_BATCH_EXPIRED(HttpStatus.GONE, "사진 배치의 등록 기한이 지났습니다."),
    PHOTO_BATCH_FULL(HttpStatus.CONFLICT, "사진 배치의 등록 한도에 도달했습니다."),
    ASSET_ALREADY_REGISTERED(HttpStatus.CONFLICT, "다른 정보로 등록한 사진 파일입니다.");
    private final HttpStatus status;
    private final String message;
    PhotoErrorCode(HttpStatus status, String message) { this.status = status; this.message = message; }
    public HttpStatus status() { return status; }
    public String code() { return name(); }
    public String message() { return message; }
}
