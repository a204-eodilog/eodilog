package com.eodilog.asset.exception;

import com.eodilog.global.common.error.ErrorCode;
import org.springframework.http.HttpStatus;

public enum AssetErrorCode implements ErrorCode {

	// 없는 파일·남의 파일·볼 권한이 없는 파일을 같은 응답으로 숨긴다. 다운로드는 READY가 아닌 파일도 이 응답이다
	ASSET_NOT_FOUND(HttpStatus.NOT_FOUND, "파일을 찾을 수 없습니다."),

	// 업로드 대기(PENDING)가 아닌 파일의 complete·취소. 이미 확인했거나 취소한 파일
	ASSET_NOT_PENDING(HttpStatus.CONFLICT, "이미 업로드를 마쳤거나 취소한 파일입니다."),

	// complete 했는데 저장소에 아직 파일이 없다. 업로드 URL로 올린 뒤 다시 부른다
	UPLOAD_NOT_FOUND(HttpStatus.CONFLICT, "파일이 아직 올라오지 않았습니다. 업로드를 마친 뒤 다시 시도해 주세요."),

	// 올린 파일이 업로드 요청 때 알려준 크기·형식과 다르다. 올린 파일은 지운다
	UPLOAD_MISMATCH(HttpStatus.UNPROCESSABLE_CONTENT, "올린 파일이 요청한 크기나 형식과 다릅니다. 다시 올려 주세요.");

	private final HttpStatus status;
	private final String message;

	AssetErrorCode(HttpStatus status, String message) {
		this.status = status;
		this.message = message;
	}

	@Override
	public HttpStatus status() {
		return status;
	}

	@Override
	public String code() {
		return name();
	}

	@Override
	public String message() {
		return message;
	}

}
