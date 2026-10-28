package com.eodilog.global.security;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;

import java.util.List;
import java.util.UUID;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

// 실제 토큰 필터를 거치지 않고 인증된 AuthUser principal을 넣는다(A·B 계약 §1)
public final class AuthUserRequestPostProcessors {

	private AuthUserRequestPostProcessors() {
	}

	public static RequestPostProcessor authUser(UUID userId) {
		return authentication(UsernamePasswordAuthenticationToken.authenticated(new AuthUser(userId), null, List.of()));
	}

}
