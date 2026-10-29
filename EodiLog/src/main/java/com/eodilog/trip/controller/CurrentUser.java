package com.eodilog.trip.controller;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.security.AuthUser;
import java.util.UUID;

public final class CurrentUser {

	private CurrentUser() {
	}

	// 서비스 토큰 인증(A)이 연결되기 전에는 principal이 AuthUser가 아닐 수 있다
	public static UUID requireUserId(AuthUser authUser) {
		if (authUser == null) {
			throw new BusinessException(CommonErrorCode.UNAUTHENTICATED);
		}
		return authUser.userId();
	}

}
