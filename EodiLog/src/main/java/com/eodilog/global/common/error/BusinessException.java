package com.eodilog.global.common.error;

import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import java.util.List;

// 업무 규칙 위반. GlobalExceptionHandler가 ErrorCode의 상태 코드와 공통 실패 형식으로 바꾼다
public class BusinessException extends RuntimeException {

	private final ErrorCode errorCode;
	private final List<ErrorField> fields;

	public BusinessException(ErrorCode errorCode) {
		this(errorCode, errorCode.message());
	}

	public BusinessException(ErrorCode errorCode, String message) {
		this(errorCode, message, List.of());
	}

	public BusinessException(ErrorCode errorCode, String message, List<ErrorField> fields) {
		super(message);
		this.errorCode = errorCode;
		this.fields = List.copyOf(fields);
	}

	public ErrorCode getErrorCode() {
		return errorCode;
	}

	public List<ErrorField> getFields() {
		return fields;
	}

}
