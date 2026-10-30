package com.eodilog.domain.auth;

import com.eodilog.global.common.error.*;
import com.eodilog.global.security.AuthUser;
import com.eodilog.user.service.UserCardReader;
import com.eodilog.user.dto.UserCard;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;
import java.io.IOException;
import java.util.List;
import org.springframework.util.LinkedMultiValueMap;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.http.*;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class HttpKakaoGatewayTest {
    RestClient.Builder builder;
    MockRestServiceServer server;
    HttpKakaoGateway gateway;
    @BeforeEach void setup() {
        builder=RestClient.builder(); server=MockRestServiceServer.bindTo(builder).build();
        gateway=new HttpKakaoGateway(new AuthProperties("client","secret",List.of("https://app.example.com/oauth/kakao"),"test-key-at-least-thirty-two-bytes-long","test",3600,86400,300),builder.build());
    }
    @Test void exchangesFormAndMapsOnlyProviderIdentityAndNickname() {
        var expected=new LinkedMultiValueMap<String,String>();
        expected.add("grant_type","authorization_code"); expected.add("client_id","client");
        expected.add("redirect_uri","https://app.example.com/oauth/kakao"); expected.add("code","code");
        expected.add("client_secret","secret"); expected.add("code_verifier","verifier");
        server.expect(requestTo("https://kauth.kakao.com/oauth/token")).andExpect(method(HttpMethod.POST))
            .andExpect(content().formData(expected))
            .andRespond(withSuccess("{\"access_token\":\"provider-token\"}",MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://kapi.kakao.com/v2/user/me")).andExpect(header("Authorization","Bearer provider-token"))
            .andRespond(withSuccess("{\"id\":123,\"kakao_account\":{\"email\":\"private@example.com\",\"profile\":{\"nickname\":\"여행자\",\"is_default_nickname\":false}}}",MediaType.APPLICATION_JSON));
        assertThat(gateway.exchange("code","https://app.example.com/oauth/kakao","verifier")).isEqualTo(new KakaoGateway.KakaoUser("123","여행자")); server.verify();
    }
    @Test void defaultNicknameRemainsMissing() {
        server.expect(requestTo("https://kauth.kakao.com/oauth/token")).andRespond(withSuccess("{\"access_token\":\"provider-token\"}",MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://kapi.kakao.com/v2/user/me")).andRespond(withSuccess("{\"id\":123,\"kakao_account\":{\"profile\":{\"nickname\":\"기본\",\"is_default_nickname\":true}}}",MediaType.APPLICATION_JSON));
        assertThat(gateway.exchange("code","https://app.example.com/oauth/kakao","verifier").nickname()).isNull();
    }
    @Test void errorsAndTimeoutsDoNotExposeProviderBodies() {
        server.expect(requestTo("https://kauth.kakao.com/oauth/token")).andRespond(withStatus(HttpStatus.BAD_REQUEST).body("private-provider-secret"));
        assertThatThrownBy(()->gateway.exchange("code","https://app.example.com/oauth/kakao","verifier")).isInstanceOf(BusinessException.class).hasMessageNotContaining("private-provider-secret").hasNoCause();
        server.reset();
        server.expect(requestTo("https://kauth.kakao.com/oauth/token")).andRespond(withException(new IOException("private timeout details")));
        assertThatThrownBy(()->gateway.exchange("code","https://app.example.com/oauth/kakao","verifier")).isInstanceOf(BusinessException.class).hasMessageNotContaining("private timeout details").hasNoCause();
    }
}
