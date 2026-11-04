package com.eodilog.domain.auth;

import com.eodilog.global.common.error.*;
import com.eodilog.global.security.AuthUser;
import com.eodilog.user.service.UserCardReader;
import com.eodilog.user.dto.UserCard;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.test.system.CapturedOutput;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import tools.jackson.databind.ObjectMapper;
import com.eodilog.user.*;
import static com.eodilog.domain.auth.AuthDtos.*;

@SpringBootTest @AutoConfigureMockMvc
@Import({AuthIntegrationTest.ContractController.class, AuthIntegrationTest.AuthDatabase.class})
class AuthIntegrationTest {
    @Test void localDiagnosticHtmlIsNotExposedWithoutLocalProfile() throws Exception {
        for(String path:List.of("/dev/kakao-login","/oauth/kakao/callback","/local-dev/kakao-login.html"))
            mvc.perform(get(path)).andExpect(status().isUnauthorized()).andExpect(content().contentTypeCompatibleWith("application/json"));
    }
    @org.springframework.boot.test.context.TestConfiguration(proxyBeanMethods=false)
    static class AuthDatabase {
        @org.springframework.context.annotation.Bean
        @org.springframework.boot.testcontainers.service.connection.ServiceConnection
        org.testcontainers.postgresql.PostgreSQLContainer postgresContainer() {
            return new org.testcontainers.postgresql.PostgreSQLContainer(
                org.testcontainers.utility.DockerImageName.parse("postgis/postgis:17-3.5").asCompatibleSubstituteFor("postgres"));
        }
    }
    @Test void allFailureLayersShareTraceHeaderAndBody() throws Exception {
        String bearer="Bearer "+login().accessToken();
        var requests=List.of(
            get("/api/v1/me"),
            get("/api/v1/me").header("Authorization","Bearer forged"),
            patch("/api/v1/me").header("Authorization",bearer).contentType("application/json").content("{\"nickname\":42,\"unknown\":true}"),
            get("/api/v1/test/failure").header("Authorization",bearer));
        for(var request:requests) {
            var response=mvc.perform(request).andReturn().getResponse();
            assertThat(response.getStatus()).isGreaterThanOrEqualTo(400);
            String trace=mapper.readTree(response.getContentAsString()).at("/error/traceId").asText();
            assertThat(trace).matches("[0-9a-f]{32}");
            assertThat(response.getHeader("X-Trace-Id")).isEqualTo(trace);
        }
        when(gateway.exchange(anyString(),anyString(),anyString())).thenReturn(new KakaoGateway.KakaoUser("pending-trace",null));
        var pending=mvc.perform(get("/api/v1/trips").header("Authorization","Bearer "+login().accessToken()))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("PROFILE_INCOMPLETE")).andReturn().getResponse();
        assertThat(pending.getHeader("X-Trace-Id")).isEqualTo(mapper.readTree(pending.getContentAsString()).at("/error/traceId").asText());
    }
    @RestController
    static class ContractController {
        private final UserCardReader lookup;
        ContractController(UserCardReader lookup) { this.lookup=lookup; }
        @GetMapping("/api/v1/test/contract")
        UserCard contract(@AuthenticationPrincipal AuthUser user) { return lookup.findCards(user.userId(),List.of(user.userId())).get(user.userId()); }
        @GetMapping("/api/v1/test/failure")
        void failure() { throw new IllegalStateException("private-token-and-PII-must-not-leak"); }
    }
    static final String REDIRECT="https://app.example.com/oauth/kakao";
    static final String VERIFIER="dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    static final String BASE="/api/v1/auth/oauth/KAKAO";
    @Autowired AuthService service;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired Tokens tokens;
    @Autowired AuthProperties properties;
    @Autowired UserCardReader lookup;
    @MockitoBean KakaoGateway gateway;
    @BeforeEach void clean() {
        jdbc.update("DELETE FROM sessions"); jdbc.update("DELETE FROM oauth_accounts"); jdbc.update("DELETE FROM oauth_attempts"); jdbc.update("DELETE FROM users");
        when(gateway.exchange(anyString(),anyString(),anyString())).thenReturn(new KakaoGateway.KakaoUser("123","여행자"));
    }
    OAuthAuthorization start() { return service.start("KAKAO",new AuthorizationRequest(REDIRECT,Tokens.hash(VERIFIER))); }
    OAuthExchange request(OAuthAuthorization a) { return new OAuthExchange(a.authorizationId(),"code",REDIRECT,a.state(),VERIFIER); }
    Session login() { return service.exchange("KAKAO",request(start())); }
    long count(String table) { return jdbc.queryForObject("SELECT COUNT(*) FROM "+table,Long.class); }
    static final String REFRESH="/api/v1/auth/sessions/refresh";
    @Test void refreshRotatesHashesClaimsAndSlidingExpiryAndRejectsOldAccess() throws Exception {
        var first=login(); var oldClaims=tokens.verify(first.accessToken());
        jdbc.update("UPDATE sessions SET expires_at=? WHERE id=?",Timestamp.from(Instant.now().plusSeconds(60)),oldClaims.sessionId());
        Instant before=Instant.now();
        var response=mvc.perform(post(REFRESH).header("Authorization","Bearer expired-or-forged").contentType("application/json")
            .content(mapper.writeValueAsString(new RefreshRequest(first.refreshToken()))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.isNewUser").value(false)).andReturn().getResponse();
        var next=mapper.readValue(mapper.readTree(response.getContentAsString()).get("data").toString(),Session.class);
        var claims=tokens.verify(next.accessToken());
        assertThat(claims.userId()).isEqualTo(first.user().id());
        assertThat(claims.sessionId().version()).isEqualTo(7);
        assertThat(next.refreshToken()).isNotEqualTo(first.refreshToken());
        assertThat(next.expiresIn()).isEqualTo(3600);
        assertThat(jdbc.queryForObject("SELECT rotated_from_id FROM sessions WHERE id=?",UUID.class,claims.sessionId())).isEqualTo(oldClaims.sessionId());
        assertThat(jdbc.queryForObject("SELECT refresh_token_hash FROM sessions WHERE id=?",String.class,claims.sessionId())).isEqualTo(Tokens.hash(next.refreshToken()));
        assertThat(jdbc.queryForObject("SELECT expires_at FROM sessions WHERE id=?",Timestamp.class,claims.sessionId()).toInstant())
            .isBetween(before.plusSeconds(1209600),Instant.now().plusSeconds(1209600));
        mvc.perform(get("/api/v1/me").header("Authorization","Bearer "+first.accessToken())).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/me").header("Authorization","Bearer "+next.accessToken())).andExpect(status().isOk());
    }
    @Test void replayRevokesMultipleGenerationsButKeepsOtherDevice() throws Exception {
        var first=login(); var device=login();
        var second=service.refresh(new RefreshRequest(first.refreshToken()));
        var third=service.refresh(new RefreshRequest(second.refreshToken()));
        jdbc.update("UPDATE sessions SET expires_at=? WHERE id=?",Timestamp.from(Instant.now().minusSeconds(1)),tokens.verify(first.accessToken()).sessionId());
        mvc.perform(post(REFRESH).contentType("application/json").content(mapper.writeValueAsString(new RefreshRequest(first.refreshToken()))))
            .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.error.code").value("UNAUTHENTICATED"));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sessions WHERE revoked_at IS NULL",Integer.class)).isEqualTo(1);
        mvc.perform(get("/api/v1/me").header("Authorization","Bearer "+third.accessToken())).andExpect(status().isUnauthorized());
        assertThatThrownBy(()->service.refresh(new RefreshRequest(third.refreshToken()))).isInstanceOf(BusinessException.class);
        mvc.perform(get("/api/v1/me").header("Authorization","Bearer "+device.accessToken())).andExpect(status().isOk());
        assertThat(service.refresh(new RefreshRequest(device.refreshToken())).user().id()).isEqualTo(first.user().id());
    }
    @Test void successorInsertFailureRollsBackPredecessorRevocation() throws Exception {
        var first=login(); var claims=tokens.verify(first.accessToken());
        try(var generator=mockStatic(com.eodilog.global.id.UuidV7.class)) {
            generator.when(com.eodilog.global.id.UuidV7::generate).thenReturn(claims.sessionId());
            assertThatThrownBy(()->service.refresh(new RefreshRequest(first.refreshToken())))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        }
        assertThat(count("sessions")).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT revoked_at FROM sessions WHERE id=?",Timestamp.class,claims.sessionId())).isNull();
        mvc.perform(get("/api/v1/me").header("Authorization","Bearer "+first.accessToken())).andExpect(status().isOk());
        var next=service.refresh(new RefreshRequest(first.refreshToken()));
        assertThat(count("sessions")).isEqualTo(2);
        assertThat(tokens.verify(next.accessToken()).sessionId()).isNotEqualTo(claims.sessionId());
        assertThat(jdbc.queryForObject("SELECT rotated_from_id FROM sessions WHERE id=?",UUID.class,tokens.verify(next.accessToken()).sessionId())).isEqualTo(claims.sessionId());
        mvc.perform(get("/api/v1/me").header("Authorization","Bearer "+next.accessToken())).andExpect(status().isOk());
    }
    @Test void logoutRevokesOnlyCurrentDeviceAndRequiresValidatedBearer() throws Exception {
        var first=login(); var device=login();
        mvc.perform(delete("/api/v1/auth/session")).andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/v1/auth/session").header("Authorization","Bearer forged")).andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/v1/auth/session").header("Authorization","Bearer "+first.accessToken()))
            .andExpect(status().isNoContent()).andExpect(content().string(""));
        mvc.perform(get("/api/v1/me").header("Authorization","Bearer "+first.accessToken())).andExpect(status().isUnauthorized());
        assertThatThrownBy(()->service.refresh(new RefreshRequest(first.refreshToken()))).isInstanceOf(BusinessException.class);
        mvc.perform(get("/api/v1/me").header("Authorization","Bearer "+device.accessToken())).andExpect(status().isOk());
        assertThat(service.refresh(new RefreshRequest(device.refreshToken())).isNewUser()).isFalse();
    }
    @Test void refreshValidationExpiryAndInactiveMemberUseCommonErrors() throws Exception {
        for(String body:List.of("{}","{\"refreshToken\":\" \"}","{\"refreshToken\":\"x\",\"extra\":true}")) {
            var response=mvc.perform(post(REFRESH).contentType("application/json").content(body)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR")).andReturn().getResponse();
            assertThat(mapper.readTree(response.getContentAsString()).at("/error/traceId").asText()).isEqualTo(response.getHeader("X-Trace-Id"));
        }
        var expired=login();
        jdbc.update("UPDATE sessions SET expires_at=? WHERE refresh_token_hash=?",Timestamp.from(Instant.now().minusSeconds(1)),Tokens.hash(expired.refreshToken()));
        for(String token:List.of("unknown",expired.refreshToken()))
            mvc.perform(post(REFRESH).contentType("application/json").content(mapper.writeValueAsString(new RefreshRequest(token))))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.error.code").value("UNAUTHENTICATED"));
        var inactive=login(); jdbc.update("UPDATE users SET status='DEACTIVATED' WHERE id=?",inactive.user().id());
        mvc.perform(post(REFRESH).contentType("application/json").content(mapper.writeValueAsString(new RefreshRequest(inactive.refreshToken())))).andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/v1/auth/session").header("Authorization","Bearer "+inactive.accessToken())).andExpect(status().isUnauthorized());
    }
    @Test void pendingMemberCanRefreshAndLogoutButRemainsRestricted() throws Exception {
        when(gateway.exchange(anyString(),anyString(),anyString())).thenReturn(new KakaoGateway.KakaoUser("pending",null));
        var session=service.refresh(new RefreshRequest(login().refreshToken()));
        mvc.perform(get("/api/v1/me").header("Authorization","Bearer "+session.accessToken())).andExpect(status().isOk()).andExpect(jsonPath("$.data.profileCompleted").value(false));
        mvc.perform(get("/api/v1/trips").header("Authorization","Bearer "+session.accessToken())).andExpect(status().isForbidden());
        mvc.perform(delete("/api/v1/auth/session").header("Authorization","Bearer "+session.accessToken())).andExpect(status().isNoContent());
    }
    @Test void concurrentRefreshHasSingleSuccessAndReplayRevokesItsSuccessor() throws Exception {
        var first=login(); var device=login(); var ready=new CountDownLatch(2); var go=new CountDownLatch(1);
        Callable<Boolean> rotate=()->{ready.countDown(); go.await(5,TimeUnit.SECONDS); try {service.refresh(new RefreshRequest(first.refreshToken())); return true;} catch(BusinessException e) {assertThat(e.getErrorCode()).isEqualTo(CommonErrorCode.UNAUTHENTICATED); return false;}};
        try(var executor=Executors.newFixedThreadPool(2)) {
            var one=executor.submit(rotate); var two=executor.submit(rotate); assertThat(ready.await(5,TimeUnit.SECONDS)).isTrue(); go.countDown();
            assertThat(List.of(one.get(10,TimeUnit.SECONDS),two.get(10,TimeUnit.SECONDS))).containsExactlyInAnyOrder(true,false);
        }
        assertThat(count("sessions")).isEqualTo(3);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sessions WHERE revoked_at IS NULL",Integer.class)).isEqualTo(1);
        assertThat(service.authenticate(tokens.verify(device.accessToken())).id()).isEqualTo(first.user().id());
    }
    @Test void concurrentRefreshAndValidatedLogoutCannotLeaveSuccessorAlive() throws Exception {
        var first=login(); var device=login(); var claims=tokens.verify(first.accessToken());
        service.authenticate(claims);
        var ready=new CountDownLatch(2); var go=new CountDownLatch(1);
        try(var executor=Executors.newFixedThreadPool(2)) {
            var refresh=executor.submit(()->{ready.countDown(); go.await(5,TimeUnit.SECONDS); try {service.refresh(new RefreshRequest(first.refreshToken()));} catch(BusinessException e) {assertThat(e.getErrorCode()).isEqualTo(CommonErrorCode.UNAUTHENTICATED);} return true;});
            var logout=executor.submit(()->{ready.countDown(); go.await(5,TimeUnit.SECONDS); try {service.logout(claims);} catch(BusinessException e) {assertThat(e.getErrorCode()).isEqualTo(CommonErrorCode.UNAUTHENTICATED);} return true;});
            assertThat(ready.await(5,TimeUnit.SECONDS)).isTrue(); go.countDown(); refresh.get(10,TimeUnit.SECONDS); logout.get(10,TimeUnit.SECONDS);
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sessions WHERE revoked_at IS NULL",Integer.class)).isEqualTo(1);
        assertThat(service.authenticate(tokens.verify(device.accessToken())).id()).isEqualTo(first.user().id());
    }
    @Test void logoutAfterBearerValidationAndCommittedRotationRevokesSuccessor() {
        var first=login(); var claims=tokens.verify(first.accessToken()); service.authenticate(claims);
        var next=service.refresh(new RefreshRequest(first.refreshToken()));
        assertThatThrownBy(()->service.logout(claims)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(()->service.authenticate(tokens.verify(next.accessToken()))).isInstanceOf(BusinessException.class);
    }
    @Test @ExtendWith(OutputCaptureExtension.class)
    void refreshAndLogoutDoNotLogRawTokens(CapturedOutput output) throws Exception {
        var first=login(); var next=service.refresh(new RefreshRequest(first.refreshToken())); var separate=login();
        mvc.perform(post(REFRESH).contentType("application/json").content(mapper.writeValueAsString(new RefreshRequest(first.refreshToken())))).andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/v1/auth/session").header("Authorization","Bearer "+next.accessToken())).andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/v1/auth/session").header("Authorization","Bearer "+separate.accessToken())).andExpect(status().isNoContent());
        assertThat(output.getAll()).doesNotContain(first.accessToken(),first.refreshToken(),next.accessToken(),next.refreshToken(),separate.accessToken(),separate.refreshToken());
    }
    @Test void legacyV4SessionCanRotateAndLogout() {
        var first=login(); var original=tokens.verify(first.accessToken()); var legacyId=UUID.randomUUID();
        jdbc.update("UPDATE sessions SET id=? WHERE id=?",legacyId,original.sessionId());
        var next=service.refresh(new RefreshRequest(first.refreshToken()));
        assertThat(jdbc.queryForObject("SELECT rotated_from_id FROM sessions WHERE id=?",UUID.class,tokens.verify(next.accessToken()).sessionId())).isEqualTo(legacyId);
        service.logout(tokens.verify(next.accessToken()));
    }
    @Test void newLoginPersistsVersion7IdsAndMatchingTokenClaims() throws Exception {
        var authorization=start();
        var session=service.exchange("KAKAO",request(authorization));
        var claims=tokens.verify(session.accessToken());
        assertThat(claims.expiresAt()).isAfter(Instant.now());
        assertThat(claims.expiresAt()).isBefore(Instant.now().plusSeconds(session.expiresIn()+5));
        for(String table:List.of("oauth_attempts","users","oauth_accounts","sessions")) {
            var id=jdbc.queryForObject("SELECT id FROM "+table,UUID.class);
            assertThat(id.version()).as(table).isEqualTo(7);
            assertThat(id.variant()).as(table).isEqualTo(2);
        }
        assertThat(jdbc.queryForObject("SELECT id FROM oauth_attempts",UUID.class)).isEqualTo(authorization.authorizationId());
        assertThat(claims.userId()).isEqualTo(session.user().id());
        assertThat(jdbc.queryForObject("SELECT id FROM sessions",UUID.class)).isEqualTo(claims.sessionId());
        assertThat(jdbc.queryForObject("SELECT user_id FROM oauth_accounts",UUID.class)).isEqualTo(session.user().id());
        assertThat(jdbc.queryForObject("SELECT user_id FROM sessions",UUID.class)).isEqualTo(session.user().id());
        mvc.perform(get("/api/v1/me").header("Authorization","Bearer "+session.accessToken()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.id").value(session.user().id().toString()));
    }
    @Test void legacyVersion4UserAccountAndSessionRemainUsable() throws Exception {
        UUID userId=UUID.randomUUID(),accountId=UUID.randomUUID(),sessionId=UUID.randomUUID();
        jdbc.update("INSERT INTO users(id,nickname,profile_completed,created_at,updated_at) VALUES(?,?,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",userId,"기존 회원");
        jdbc.update("INSERT INTO oauth_accounts(id,user_id,provider,provider_user_id,created_at) VALUES(?,?,'KAKAO','123',CURRENT_TIMESTAMP)",accountId,userId);
        Timestamp legacyExpiry=Timestamp.from(Instant.now().plusSeconds(1209600).truncatedTo(java.time.temporal.ChronoUnit.SECONDS));
        jdbc.update("INSERT INTO sessions(id,user_id,refresh_token_hash,expires_at,created_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)",sessionId,userId,Tokens.hash("legacy-refresh"),legacyExpiry);
        String legacyAccess=tokens.issue(userId,sessionId);
        mvc.perform(get("/api/v1/me").header("Authorization","Bearer "+legacyAccess))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.id").value(userId.toString()));
        var next=login();
        assertThat(next.isNewUser()).isFalse();
        assertThat(next.user().id()).isEqualTo(userId);
        assertThat(next.user().nickname()).isEqualTo("기존 회원");
        assertThat(tokens.verify(next.accessToken()).sessionId().version()).isEqualTo(7);
        assertThat(jdbc.queryForObject("SELECT id FROM oauth_accounts",UUID.class)).isEqualTo(accountId);
        assertThat(count("users")).isEqualTo(1);
        assertThat(count("sessions")).isEqualTo(2);
        var stored=jdbc.queryForMap("SELECT user_id,refresh_token_hash,expires_at,revoked_at FROM sessions WHERE id=?",sessionId);
        assertThat(stored.get("user_id")).isEqualTo(userId);
        assertThat(stored.get("refresh_token_hash")).isEqualTo(Tokens.hash("legacy-refresh"));
        assertThat(stored.get("expires_at")).isEqualTo(legacyExpiry);
        assertThat(stored.get("revoked_at")).isNull();
        for(String access:List.of(legacyAccess,next.accessToken()))
            mvc.perform(get("/api/v1/me").header("Authorization","Bearer "+access)).andExpect(status().isOk());
    }
    @Test void outstandingVersion4AuthorizationAttemptCanStillBeExchanged() {
        var original=start();
        UUID legacyId=UUID.randomUUID();
        jdbc.update("UPDATE oauth_attempts SET id=? WHERE id=?",legacyId,original.authorizationId());
        var session=service.exchange("KAKAO",new OAuthExchange(legacyId,"code",REDIRECT,original.state(),VERIFIER));
        assertThat(tokens.verify(session.accessToken()).sessionId().version()).isEqualTo(7);
        assertThat(jdbc.queryForObject("SELECT consumed_at FROM oauth_attempts WHERE id=?",Timestamp.class,legacyId)).isNotNull();
        assertThat(service.authenticate(tokens.verify(session.accessToken())).id()).isEqualTo(session.user().id());
    }
    @Test void startIsPublicAndRequiresPkceAndAllowlistedRedirect() throws Exception {
        mvc.perform(post(BASE+"/authorization-requests").contentType("application/json").content(mapper.writeValueAsString(new AuthorizationRequest(REDIRECT,Tokens.hash(VERIFIER)))))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.data.authorizationUrl").value(org.hamcrest.Matchers.containsString("code_challenge_method=S256")));
        mvc.perform(post(BASE+"/authorization-requests").contentType("application/json").content("{\"redirectUri\":\"https://app.example.com/oauth/kakao\"}")) .andExpect(status().isBadRequest());
        assertThatThrownBy(()->service.start("KAKAO",new AuthorizationRequest("https://evil.example",Tokens.hash(VERIFIER)))).isInstanceOf(BusinessException.class);
        assertThatThrownBy(()->service.start("NAVER",new AuthorizationRequest(REDIRECT,Tokens.hash(VERIFIER)))).isInstanceOf(BusinessException.class);
    }
    @Test void repeatLoginKeepsUuidAndNicknameAndStoresOnlyHash() {
        Instant issuedAfter=Instant.now();
        var first=login(); when(gateway.exchange(anyString(),anyString(),anyString())).thenReturn(new KakaoGateway.KakaoUser("123","바뀐 이름"));
        Instant issuedBefore=Instant.now();
        assertThat(properties.refreshSeconds()).isEqualTo(1209600);
        assertThat(first.expiresIn()).isEqualTo(3600);
        Instant storedExpiry=jdbc.queryForObject("SELECT expires_at FROM sessions WHERE refresh_token_hash=?",Timestamp.class,Tokens.hash(first.refreshToken())).toInstant();
        assertThat(storedExpiry).isBetween(issuedAfter.plusSeconds(1209600),issuedBefore.plusSeconds(1209600));
        var second=login(); assertThat(second.user().id()).isEqualTo(first.user().id()); assertThat(second.user().nickname()).isEqualTo("여행자");
        assertThat(first.isNewUser()).isTrue(); assertThat(second.isNewUser()).isFalse(); assertThat(count("users")).isEqualTo(1); assertThat(count("oauth_accounts")).isEqualTo(1);
        assertThat(jdbc.queryForList("SELECT refresh_token_hash FROM sessions",String.class)).contains(Tokens.hash(first.refreshToken())).doesNotContain(first.refreshToken());
        assertThat(lookup.findCards(first.user().id(),List.of(first.user().id())).get(first.user().id()).nickname()).isEqualTo("여행자");
    }
    @Test void contextRejectsWrongStateRedirectVerifierExpiredAndReplay() {
        var a=start(); var good=request(a);
        assertThatThrownBy(()->service.exchange("KAKAO",new OAuthExchange(a.authorizationId(),"code",REDIRECT,"wrong",VERIFIER))).isInstanceOf(BusinessException.class);
        assertThatThrownBy(()->service.exchange("KAKAO",new OAuthExchange(a.authorizationId(),"code","wrong",a.state(),VERIFIER))).isInstanceOf(BusinessException.class);
        assertThatThrownBy(()->service.exchange("KAKAO",new OAuthExchange(a.authorizationId(),"code",REDIRECT,a.state(),"x".repeat(43)))).isInstanceOf(BusinessException.class);
        service.exchange("KAKAO",good); assertThatThrownBy(()->service.exchange("KAKAO",good)).isInstanceOf(BusinessException.class);
        var expired=start(); jdbc.update("UPDATE oauth_attempts SET expires_at=? WHERE id=?",Timestamp.from(Instant.now().minusSeconds(1)),expired.authorizationId());
        assertThatThrownBy(()->service.exchange("KAKAO",request(expired))).isInstanceOf(BusinessException.class);
        verify(gateway,times(1)).exchange(anyString(),anyString(),anyString());
    }
    @Test void providerFailureConsumesContextWithoutCreatingUserOrSession() {
        when(gateway.exchange(anyString(),anyString(),anyString())).thenThrow(new BusinessException(AuthErrorCode.PROVIDER_UNAVAILABLE));
        var req=request(start()); assertThatThrownBy(()->service.exchange("KAKAO",req)).isInstanceOf(BusinessException.class);
        assertThat(count("users")).isZero(); assertThat(count("sessions")).isZero(); assertThatThrownBy(()->service.exchange("KAKAO",req)).isInstanceOf(BusinessException.class);
    }
    @Test void pendingUserCanCompleteWithSameTokenAndUnknownFieldsRejected() throws Exception {
        when(gateway.exchange(anyString(),anyString(),anyString())).thenReturn(new KakaoGateway.KakaoUser("123",null));
        var session=login(); String bearer="Bearer "+session.accessToken(); assertThat(session.user().profileCompleted()).isFalse(); assertThat(session.user().nickname()).isEmpty();
        mvc.perform(get("/api/v1/me").header("Authorization",bearer)).andExpect(status().isOk()).andExpect(jsonPath("$.data.profileCompleted").value(false));
        mvc.perform(get("/api/v1/trips").header("Authorization",bearer)).andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("PROFILE_INCOMPLETE"));
        for(String body:List.of("{\"nickname\":\" \"}","{\"nickname\":\"ok\",\"ageBand\":\"20\"}","{\"nickname\":\""+"x".repeat(51)+"\"}"))
            mvc.perform(patch("/api/v1/me").header("Authorization",bearer).contentType("application/json").content(body)).andExpect(status().isBadRequest());
        mvc.perform(patch("/api/v1/me").header("Authorization",bearer).contentType("application/json").content("{\"nickname\":\"  새 이름  \"}")).andExpect(status().isOk()).andExpect(jsonPath("$.data.nickname").value("새 이름")).andExpect(jsonPath("$.data.profileCompleted").value(true));
        mvc.perform(get("/api/v1/me").header("Authorization",bearer)).andExpect(status().isOk()).andExpect(jsonPath("$.data.profileCompleted").value(true));
        assertThat(service.authenticate(tokens.verify(session.accessToken())).profileCompleted()).isTrue();
    }
    @Test void blankDefaultAndOversizeNicknameRemainPending() {
        for(String nickname:List.of(" ","기본 닉네임","x".repeat(51),"bad\0nickname")) {
            when(gateway.exchange(anyString(),anyString(),anyString())).thenReturn(new KakaoGateway.KakaoUser(UUID.randomUUID().toString(),nickname));
            assertThat(login().user().profileCompleted()).isFalse();
        }
    }
    @Test void missingForgedExpiredRevokedAndInactiveTokensDenied() throws Exception {
        mvc.perform(get("/api/v1/me")).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.error.code").value("UNAUTHENTICATED"));
        mvc.perform(get("/api/v1/me").header("Authorization","Bearer forged")).andExpect(status().isUnauthorized());
        var session=login(); var c=tokens.verify(session.accessToken());
        var expired=new SignedJWT(new JWSHeader(JWSAlgorithm.HS256),new JWTClaimsSet.Builder().issuer(properties.issuer()).subject(c.userId().toString()).jwtID(c.sessionId().toString()).expirationTime(Date.from(Instant.now().minusSeconds(5))).build());
        expired.sign(new MACSigner(properties.jwtSecret()));
        mvc.perform(get("/api/v1/me").header("Authorization","Bearer "+expired.serialize())).andExpect(status().isUnauthorized());
        var wrongKey=new SignedJWT(new JWSHeader(JWSAlgorithm.HS256),new JWTClaimsSet.Builder().issuer(properties.issuer()).subject(c.userId().toString()).jwtID(c.sessionId().toString()).expirationTime(Date.from(Instant.now().plusSeconds(3600))).build());
        wrongKey.sign(new MACSigner("another-test-signing-key-at-least-32-bytes"));
        mvc.perform(get("/api/v1/me").header("Authorization","Bearer "+wrongKey.serialize())).andExpect(status().isUnauthorized());
        jdbc.update("UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id=?",c.sessionId());
        mvc.perform(get("/api/v1/me").header("Authorization","Bearer "+session.accessToken())).andExpect(status().isUnauthorized());
        var next=login(); jdbc.update("UPDATE users SET status='DEACTIVATED' WHERE id=?",next.user().id());
        mvc.perform(get("/api/v1/me").header("Authorization","Bearer "+next.accessToken())).andExpect(status().isUnauthorized());
        assertThatThrownBy(()->service.authenticate(tokens.verify(next.accessToken()))).isInstanceOf(BusinessException.class);
    }
    @Test void concurrentFirstLoginCreatesOneUserAndNoOrphan() throws Exception {
        var barrier=new CyclicBarrier(2);
        when(gateway.exchange(anyString(),anyString(),anyString())).thenAnswer(invocation->{barrier.await(5,TimeUnit.SECONDS); return new KakaoGateway.KakaoUser("same","동시");});
        var a=request(start()); var b=request(start());
        try(var executor=Executors.newFixedThreadPool(2)) {
            var one=executor.submit(()->service.exchange("KAKAO",a)); var two=executor.submit(()->service.exchange("KAKAO",b));
            assertThat(one.get(10,TimeUnit.SECONDS).user().id()).isEqualTo(two.get(10,TimeUnit.SECONDS).user().id());
        }
        assertThat(count("users")).isEqualTo(1); assertThat(count("oauth_accounts")).isEqualTo(1); assertThat(count("sessions")).isEqualTo(2);
    }
    @Test void openApiDescribesPublicAndProtectedOperations() throws Exception {
        var json=mapper.readTree(mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        var refresh=json.at("/paths/~1api~1v1~1auth~1sessions~1refresh/post");
        assertThat(refresh.at("/security").isArray()).isTrue(); assertThat(refresh.at("/security").size()).isZero();
        assertThat(refresh.at("/responses/401").isMissingNode()).isFalse();
        for(String status:List.of("400","401"))
            assertThat(refresh.at("/responses/"+status+"/content/application~1json/schema/$ref").asText()).isEqualTo("#/components/schemas/ErrorResponse");
        assertThat(json.at("/components/schemas/RefreshRequest/required").toString()).contains("refreshToken");
        var logout=json.at("/paths/~1api~1v1~1auth~1session/delete");
        assertThat(logout.at("/responses/204").isMissingNode()).isFalse();
        assertThat(logout.at("/responses/401/content/application~1json/schema/$ref").asText()).isEqualTo("#/components/schemas/ErrorResponse");
        assertThat((logout.has("security") ? logout.get("security") : json.get("security")).toString()).contains("bearerAuth");
        for(String operation:List.of("authorization-requests","sessions")) {
            var security=json.at("/paths/~1api~1v1~1auth~1oauth~1{provider}~1"+operation+"/post/security");
            assertThat(security.isArray()).isTrue(); assertThat(security.size()).isZero();
        }
        for(String method:List.of("get","patch")) {
            var operation=json.at("/paths/~1api~1v1~1me/"+method);
            var security=operation.has("security") ? operation.get("security") : json.get("security");
            assertThat(security.toString()).contains("bearerAuth"); assertThat(security.size()).isGreaterThan(0);
        }
        assertThat(json.at("/paths/~1api~1v1~1me/get/summary").asText()).isNotEmpty();
        assertThat(json.at("/paths/~1api~1v1~1me/patch/summary").asText()).isNotEmpty();
        assertThat(json.at("/components/schemas/OAuthExchange/required").toString()).contains("codeVerifier");
        assertThat(json.at("/components/schemas/MyProfile/properties/profileCompleted").isMissingNode()).isFalse();
        assertThat(json.at("/components/schemas/OAuthAuthorization/required").toString()).contains("authorizationId","authorizationUrl","state","expiresAt");
        assertThat(json.at("/components/schemas/Session/required").toString()).contains("accessToken","refreshToken","expiresIn","user","isNewUser");
        assertThat(json.at("/components/schemas/MyProfile/required").toString()).contains("id","nickname","profileImageUrl","accountVisibility","followingStatus","followedByStatus","ageBand","ageUseConsent","profileCompleted","profileUrl");
        assertThat(json.at("/components/schemas/MyProfile/properties/profileImageUrl").toString()).contains("null");
        assertThat(json.at("/components/schemas/MyProfile/properties/ageBand").toString()).contains("null");
    }
    @Test void anonymousSessionEndpointReturnsEnvelopeAndTokenWorksForMe() throws Exception {
        var response=mvc.perform(post(BASE+"/sessions").contentType("application/json").content(mapper.writeValueAsString(request(start()))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.accessToken").isString())
            .andExpect(jsonPath("$.data.refreshToken").isString()).andExpect(jsonPath("$.data.expiresIn").value(3600))
            .andExpect(jsonPath("$.data.isNewUser").value(true)).andExpect(jsonPath("$.data.user.profileCompleted").value(true))
            .andReturn().getResponse().getContentAsString();
        var data=mapper.readTree(response).get("data");
        mvc.perform(get("/api/v1/me").header("Authorization","Bearer "+data.get("accessToken").asText())).andExpect(status().isOk()).andExpect(jsonPath("$.data.id").value(data.get("user").get("id").asText()));
    }
    @Test void publicLoginAndSwaggerIgnoreStaleOrPendingAuthorization() throws Exception {
        when(gateway.exchange(anyString(),anyString(),anyString())).thenReturn(new KakaoGateway.KakaoUser("123",null));
        String pending=login().accessToken();
        var claims=tokens.verify(pending);
        var expired=new SignedJWT(new JWSHeader(JWSAlgorithm.HS256),new JWTClaimsSet.Builder().issuer(properties.issuer()).subject(claims.userId().toString()).jwtID(claims.sessionId().toString()).expirationTime(Date.from(Instant.now().minusSeconds(5))).build());
        expired.sign(new MACSigner(properties.jwtSecret()));
        for(String token:List.of(pending,expired.serialize())) {
            mvc.perform(post(BASE+"/authorization-requests").header("Authorization","Bearer "+token).contentType("application/json").content(mapper.writeValueAsString(new AuthorizationRequest(REDIRECT,Tokens.hash(VERIFIER))))).andExpect(status().isCreated());
            mvc.perform(post(BASE+"/sessions").header("Authorization","Bearer "+token).contentType("application/json").content(mapper.writeValueAsString(request(start())))).andExpect(status().isOk());
            mvc.perform(get("/v3/api-docs").header("Authorization","Bearer "+token)).andExpect(status().isOk());
            mvc.perform(get("/swagger-ui/index.html").header("Authorization","Bearer "+token)).andExpect(status().isOk());
        }
    }
    @Test void bearerSchemeIsCaseInsensitiveAndNulNicknameRejectedBeforePersistence() throws Exception {
        var session=login();
        for(String scheme:List.of("bearer ","bEaReR "))
            mvc.perform(get("/api/v1/me").header("Authorization",scheme+session.accessToken())).andExpect(status().isOk());
        mvc.perform(patch("/api/v1/me").header("Authorization","Bearer "+session.accessToken()).contentType("application/json").content(mapper.writeValueAsString(new NicknamePatch("bad\0name")))).andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
        assertThat(lookup.findCards(session.user().id(),List.of(session.user().id())).get(session.user().id()).nickname()).isEqualTo("여행자");
    }
    @Test void authorizationRedirectPlusRoundTripsThroughFormStyleQueryDecoding() {
        String redirect="https://app.example.com/oauth/callback+expo?channel=app+test";
        var configured=new AuthProperties(properties.kakaoClientId(),properties.kakaoClientSecret(),List.of(redirect),properties.jwtSecret(),properties.issuer(),properties.accessSeconds(),properties.refreshSeconds(),properties.attemptSeconds());
        var localService=new AuthService(jdbc,new org.springframework.jdbc.support.JdbcTransactionManager(jdbc.getDataSource()),configured,tokens,gateway,new MemberStore(jdbc));
        String url=localService.start("KAKAO",new AuthorizationRequest(redirect,Tokens.hash(VERIFIER))).authorizationUrl();
        var query=Arrays.stream(URI.create(url).getRawQuery().split("&")).map(entry->entry.split("=",2)).filter(pair->pair[0].equals("redirect_uri")).findFirst().orElseThrow();
        assertThat(URLDecoder.decode(query[1],StandardCharsets.UTF_8)).isEqualTo(redirect);
    }
    @Test void sameContextConcurrentExchangeCallsProviderAndCreatesSessionOnce() throws Exception {
        var req=request(start()); var ready=new CountDownLatch(2); var go=new CountDownLatch(1);
        Callable<Boolean> exchange=()-> { ready.countDown(); go.await(5,TimeUnit.SECONDS); try { service.exchange("KAKAO",req); return true; } catch(BusinessException e) { assertThat(e.getErrorCode().status().value()).isEqualTo(400); return false; } };
        try(var executor=Executors.newFixedThreadPool(2)) {
            var one=executor.submit(exchange); var two=executor.submit(exchange); assertThat(ready.await(5,TimeUnit.SECONDS)).isTrue(); go.countDown();
            assertThat(List.of(one.get(10,TimeUnit.SECONDS),two.get(10,TimeUnit.SECONDS))).containsExactlyInAnyOrder(true,false);
        }
        verify(gateway,times(1)).exchange(anyString(),anyString(),anyString()); assertThat(count("sessions")).isEqualTo(1);
    }
    @Test void bControllerUsesTestAuthenticationPrincipalAndPublicLookupWithoutBearer() throws Exception {
        var member=login().user();
        var principal=new AuthUser(member.id());
        var authentication=new UsernamePasswordAuthenticationToken(principal,null,List.of());
        var response=mvc.perform(get("/api/v1/test/contract").with(authentication(authentication)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(member.id().toString()))
            .andExpect(jsonPath("$.nickname").value(member.nickname())).andExpect(jsonPath("$.ageBand").doesNotExist())
            .andReturn().getResponse();
        var card=mapper.readTree(response.getContentAsString());
        assertThat(card.propertyNames()).containsExactlyInAnyOrder("id","nickname","profileImageUrl",
            "accountVisibility","followingStatus","followedByStatus");
        assertThat(card.has("profileImageUrl")).isTrue();
        assertThat(card.get("profileImageUrl").isNull()).isTrue();
    }
    @Test @ExtendWith(OutputCaptureExtension.class)
    void methodMediaAndUnexpectedErrorsUseSafeEnvelope(CapturedOutput output) throws Exception {
        String bearer="Bearer "+login().accessToken();
        mvc.perform(post("/api/v1/me").header("Authorization",bearer)).andExpect(status().isMethodNotAllowed()).andExpect(jsonPath("$.error.code").value("METHOD_NOT_ALLOWED")).andExpect(jsonPath("$.error.traceId").isNotEmpty());
        mvc.perform(patch("/api/v1/me").header("Authorization",bearer).contentType("text/plain").content("private request"))
            .andExpect(status().isUnsupportedMediaType()).andExpect(jsonPath("$.error.code").value("UNSUPPORTED_MEDIA_TYPE")).andExpect(jsonPath("$.error.traceId").isNotEmpty());
        var result=mvc.perform(get("/api/v1/test/failure").header("Authorization",bearer))
            .andExpect(status().isInternalServerError()).andExpect(jsonPath("$.error.code").value("INTERNAL_ERROR")).andExpect(jsonPath("$.error.traceId").isNotEmpty()).andExpect(jsonPath("$.error.fields").isArray()).andReturn();
        assertThat(result.getResponse().getContentAsString()).doesNotContain("private-token-and-PII-must-not-leak","IllegalStateException");
        String traceId=mapper.readTree(result.getResponse().getContentAsString()).at("/error/traceId").asText();
        assertThat(output.getOut()).contains("traceId="+traceId,"code=INTERNAL_ERROR","diagnostics=java.lang.IllegalStateException[");
        assertThat(output.getOut()).doesNotContain("private-token-and-PII-must-not-leak");
    }
}
