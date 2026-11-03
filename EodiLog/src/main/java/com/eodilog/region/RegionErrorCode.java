package com.eodilog.region;

import com.eodilog.global.common.error.ErrorCode;
import org.springframework.http.HttpStatus;

public enum RegionErrorCode implements ErrorCode {
    REGION_NOT_FOUND;
    public HttpStatus status() { return HttpStatus.NOT_FOUND; }
    public String code() { return name(); }
    public String message() { return "지역을 찾을 수 없습니다."; }
}
