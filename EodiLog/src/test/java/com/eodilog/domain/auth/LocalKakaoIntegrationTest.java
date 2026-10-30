package com.eodilog.domain.auth;

import com.eodilog.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(properties="spring.config.name=local-kakao-test")
@AutoConfigureMockMvc
@ActiveProfiles("local")
@Import(TestcontainersConfiguration.class)
class LocalKakaoIntegrationTest {
    @Autowired MockMvc mvc;
    @Test void anonymousLocalPagesAreUncachedAndNeverReflectProviderParameters() throws Exception {
        for(String path:new String[]{"/dev/kakao-login","/oauth/kakao/callback"}) {
            String html=mvc.perform(get(path).param("code","private-code-marker").param("state","private-state-marker").param("error_description","private-error-marker"))
                .andExpect(status().isOk()).andExpect(content().contentTypeCompatibleWith("text/html"))
                .andExpect(header().string("Cache-Control","no-store"))
                .andExpect(header().string("Referrer-Policy","no-referrer"))
                .andReturn().getResponse().getContentAsString();
            assertThat(html).contains("http://localhost:8080/oauth/kakao/callback","history.replaceState","sessionStorage.removeItem","/api/v1/me")
                .doesNotContain("private-code-marker","private-state-marker","private-error-marker","__LOCAL_CALLBACK_URI__");
        }
    }
    @Test void resourceIsNotAutomaticallyPublicAndOnlyGetIsAllowed() throws Exception {
        mvc.perform(get("/local-dev/kakao-login.html")).andExpect(status().isUnauthorized());
        mvc.perform(post("/dev/kakao-login")).andExpect(status().isUnauthorized());
    }
    @Test void fixedLocalRedirectUsesExistingAuthorizationValidation() throws Exception {
        mvc.perform(post("/api/v1/auth/oauth/KAKAO/authorization-requests").contentType("application/json")
            .content("{\"redirectUri\":\"http://localhost:8080/oauth/kakao/callback\",\"codeChallenge\":\"E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM\"}"))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.data.authorizationUrl").value(org.hamcrest.Matchers.containsString("kauth.kakao.com")));
    }
}
