package com.eodilog.notification;

import com.eodilog.global.common.error.ErrorCode;
import org.springframework.http.HttpStatus;

public enum NotificationErrorCode implements ErrorCode {
    NOTIFICATION_NOT_FOUND("알림을 찾을 수 없습니다."),
    EVENT_NOT_FOUND("이벤트를 찾을 수 없습니다.");

    private final String message;
    NotificationErrorCode(String message) { this.message = message; }
    @Override public HttpStatus status() { return HttpStatus.NOT_FOUND; }
    @Override public String code() { return name(); }
    @Override public String message() { return message; }
}
