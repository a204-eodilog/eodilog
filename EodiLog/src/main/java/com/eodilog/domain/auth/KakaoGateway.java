package com.eodilog.domain.auth;

public interface KakaoGateway {
    record KakaoUser(String providerUserId,String nickname) { }
    KakaoUser exchange(String code,String redirectUri,String codeVerifier);
}
