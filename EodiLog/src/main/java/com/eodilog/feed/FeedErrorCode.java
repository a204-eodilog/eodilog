package com.eodilog.feed;
import com.eodilog.global.common.error.ErrorCode;
import org.springframework.http.HttpStatus;
public enum FeedErrorCode implements ErrorCode {
    FEED_NOT_FOUND(HttpStatus.NOT_FOUND, "피드를 찾을 수 없습니다."),
    VERSION_CONFLICT(HttpStatus.CONFLICT, "변경된 피드를 다시 조회해 주세요.");
    private final HttpStatus status; private final String message;
    FeedErrorCode(HttpStatus status, String message) { this.status=status; this.message=message; }
    public HttpStatus status() { return status; }
    public String message() { return message; }
    public String code() { return name(); }
}
