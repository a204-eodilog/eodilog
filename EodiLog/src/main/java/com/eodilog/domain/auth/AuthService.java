package com.eodilog.domain.auth;

import com.eodilog.global.common.error.*;
import com.eodilog.global.id.UuidV7;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.util.UriComponentsBuilder;
import com.eodilog.user.MemberStore;
import static com.eodilog.domain.auth.AuthDtos.*;

@Service
public class AuthService {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final AuthProperties properties;
    private final Tokens tokens;
    private final KakaoGateway gateway;
    private final MemberStore members;
    public AuthService(JdbcTemplate jdbc,PlatformTransactionManager manager,AuthProperties properties,Tokens tokens,KakaoGateway gateway,MemberStore members) {
        this.jdbc=jdbc; tx=new TransactionTemplate(manager); this.properties=properties; this.tokens=tokens; this.gateway=gateway; this.members=members;
    }
    private void provider(String provider) { if(!"KAKAO".equals(provider)) throw new BusinessException(AuthErrorCode.UNSUPPORTED_PROVIDER); }
    public OAuthAuthorization start(String provider,AuthorizationRequest request) {
        provider(provider);
        if(!properties.allowedRedirects().contains(request.redirectUri())) throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
        UUID id=UuidV7.generate(); String state=tokens.random(); Instant now=Instant.now(),expiry=now.plusSeconds(properties.attemptSeconds());
        jdbc.update("INSERT INTO oauth_attempts(id,provider,state_hash,initiator_context_hash,redirect_uri,code_challenge,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)",id,provider,Tokens.hash(state),request.codeChallenge(),request.redirectUri(),request.codeChallenge(),Timestamp.from(expiry),Timestamp.from(now));
        String url=UriComponentsBuilder.fromUriString("https://kauth.kakao.com/oauth/authorize").queryParam("response_type","code").queryParam("client_id",properties.kakaoClientId()).queryParam("redirect_uri","{redirectUri}").queryParam("state",state).queryParam("code_challenge",request.codeChallenge()).queryParam("code_challenge_method","S256").encode().buildAndExpand(request.redirectUri()).toUriString();
        return new OAuthAuthorization(id,url,state,expiry);
    }
    public Session exchange(String provider,OAuthExchange request) {
        provider(provider);
        // Atomic autocommit consumes the context before provider traffic, including provider failure.
        int consumed=jdbc.update("UPDATE oauth_attempts SET consumed_at=? WHERE id=? AND provider=? AND state_hash=? AND redirect_uri=? AND code_challenge=? AND initiator_context_hash=? AND expires_at>? AND consumed_at IS NULL",Timestamp.from(Instant.now()),request.authorizationId(),provider,Tokens.hash(request.state()),request.redirectUri(),Tokens.hash(request.codeVerifier()),Tokens.hash(request.codeVerifier()),Timestamp.from(Instant.now()));
        if(consumed!=1) throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
        var user=gateway.exchange(request.code(),request.redirectUri(),request.codeVerifier());
        if(user==null || user.providerUserId()==null || user.providerUserId().isBlank()) throw new BusinessException(AuthErrorCode.PROVIDER_UNAVAILABLE);
        // Unique provider identity serializes concurrent first logins. Losing transaction rolls back its user.
        try { return tx.execute(status->save(provider,user)); }
        catch(DataIntegrityViolationException race) { return tx.execute(status->save(provider,user)); }
    }
    private Session save(String provider,KakaoGateway.KakaoUser kakao) {
        var ids=jdbc.query("SELECT user_id FROM oauth_accounts WHERE provider=? AND provider_user_id=?",(rs,n)->rs.getObject(1,UUID.class),provider,kakao.providerUserId());
        boolean isNew=ids.isEmpty(); UUID userId=isNew ? UuidV7.generate() : ids.getFirst();
        if(isNew) {
            String name=kakao.nickname()==null ? "" : kakao.nickname().strip();
            if(name.indexOf('\0')>=0 || name.codePointCount(0,name.length())>50 || name.equals("기본 닉네임")) name="";
            jdbc.update("INSERT INTO users(id,nickname,profile_completed,created_at,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",userId,name,!name.isEmpty());
            jdbc.update("INSERT INTO oauth_accounts(id,user_id,provider,provider_user_id,created_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)",UuidV7.generate(),userId,provider,kakao.providerUserId());
        }
        var profile=members.profile(userId);
        UUID sessionId=UuidV7.generate(); String refresh=tokens.random(); String access=tokens.issue(userId,sessionId);
        jdbc.update("INSERT INTO sessions(id,user_id,refresh_token_hash,expires_at,created_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)",sessionId,userId,Tokens.hash(refresh),Timestamp.from(Instant.now().plusSeconds(properties.refreshSeconds())));
        return new Session(access,refresh,properties.accessSeconds(),profile,isNew);
    }
    public MemberStore.MyProfile authenticate(Tokens.Claims claims) {
        Integer count=jdbc.queryForObject("SELECT COUNT(*) FROM sessions WHERE id=? AND user_id=? AND revoked_at IS NULL AND expires_at>?",Integer.class,claims.sessionId(),claims.userId(),Timestamp.from(Instant.now()));
        if(count==null || count!=1) throw new BusinessException(CommonErrorCode.UNAUTHENTICATED);
        return members.profile(claims.userId());
    }
}
