package com.eodilog.global.common.error;

import org.springframework.http.HttpStatus;

// 도메인별 오류 enum이 구현한다(CommonErrorCode, TripErrorCode, AuthErrorCode 등). 한 파일을 여럿이 고치지 않기 위해 나눈다
public interface ErrorCode {

	HttpStatus status();

	// 응답 error.code 값. API 명세의 대표 업무 오류 이름을 그대로 쓴다
	String code();

	// 사용자에게 보여도 되는 기본 문구
	String message();

}
