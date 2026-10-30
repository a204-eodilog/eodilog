package com.eodilog.domain.auth;

import com.eodilog.global.common.error.*;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Map;
import org.springframework.http.*;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;

@Component
public class HttpKakaoGateway implements KakaoGateway {
    private final RestClient client;
    private final AuthProperties properties;
    @org.springframework.beans.factory.annotation.Autowired
    public HttpKakaoGateway(AuthProperties properties) {
        this.properties=properties;
        var factory=new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());
        factory.setReadTimeout(Duration.ofSeconds(10)); client=RestClient.builder().requestFactory(factory).build();
    }
    HttpKakaoGateway(AuthProperties properties,RestClient client) { this.properties=properties; this.client=client; }
    @Override public KakaoUser exchange(String code,String redirectUri,String verifier) {
        try {
            var form=new LinkedMultiValueMap<String,String>();
            form.add("grant_type","authorization_code"); form.add("client_id",properties.kakaoClientId()); form.add("client_secret",properties.kakaoClientSecret()); form.add("redirect_uri",redirectUri); form.add("code",code); form.add("code_verifier",verifier);
            Map<?,?> token=client.post().uri("https://kauth.kakao.com/oauth/token").contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form).retrieve().body(Map.class);
            if(token==null || !(token.get("access_token") instanceof String access) || access.isBlank()) throw new IllegalStateException();
            Map<?,?> user=client.get().uri("https://kapi.kakao.com/v2/user/me").header(HttpHeaders.AUTHORIZATION,"Bearer "+access).retrieve().body(Map.class);
            if(user==null || !(user.get("id") instanceof Number id) || id.longValue()<=0) throw new IllegalStateException();
            String nickname=null;
            if(user.get("kakao_account") instanceof Map<?,?> account && account.get("profile") instanceof Map<?,?> profile && !Boolean.TRUE.equals(profile.get("is_default_nickname")) && profile.get("nickname") instanceof String name) nickname=name;
            return new KakaoUser(id.toString(),nickname);
        } catch(Exception e) { throw new BusinessException(AuthErrorCode.PROVIDER_UNAVAILABLE); }
    }
}
