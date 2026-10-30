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

    public Session refresh(RefreshRequest request) {
        String hash=Tokens.hash(request.refreshToken());
        Session result=tx.execute(status->{
            var owners=jdbc.query("SELECT user_id FROM sessions WHERE refresh_token_hash=?",(rs,n)->rs.getObject(1,UUID.class),hash);
            if(owners.isEmpty()) return null;
            UUID userId=owners.getFirst();
            lockMember(userId);
            var profile=members.profile(userId);
            var rows=jdbc.query("SELECT id,expires_at,revoked_at FROM sessions WHERE refresh_token_hash=? AND user_id=?",
                (rs,n)->new StoredSession(rs.getObject("id",UUID.class),rs.getTimestamp("expires_at").toInstant(),rs.getTimestamp("revoked_at")!=null),hash,userId);
            if(rows.isEmpty()) return null;
            var previous=rows.getFirst();
            if(previous.revoked()) {
                revokeDescendants(userId,previous.id());
                return null;
            }
            Instant now=Instant.now();
            if(!previous.expiresAt().isAfter(now)) return null;
            UUID sessionId=UuidV7.generate();
            String refresh=tokens.random(),access=tokens.issue(userId,sessionId);
            jdbc.update("UPDATE sessions SET revoked_at=? WHERE id=?",Timestamp.from(now),previous.id());
            jdbc.update("INSERT INTO sessions(id,user_id,refresh_token_hash,rotated_from_id,expires_at,created_at) VALUES(?,?,?,?,?,?)",
                sessionId,userId,Tokens.hash(refresh),previous.id(),Timestamp.from(now.plusSeconds(properties.refreshSeconds())),Timestamp.from(now));
            return new Session(access,refresh,properties.accessSeconds(),profile,false);
        });
        // Replay revocation must commit before the authentication error is raised.
        if(result==null) throw new BusinessException(CommonErrorCode.UNAUTHENTICATED);
        return result;
    }

    public void logout(Tokens.Claims claims) {
        Boolean valid=tx.execute(status->{
            lockMember(claims.userId());
            members.profile(claims.userId());
            var rows=jdbc.query("SELECT id,expires_at,revoked_at FROM sessions WHERE id=? AND user_id=?",
                (rs,n)->new StoredSession(rs.getObject("id",UUID.class),rs.getTimestamp("expires_at").toInstant(),rs.getTimestamp("revoked_at")!=null),claims.sessionId(),claims.userId());
            if(rows.isEmpty()) return false;
            var session=rows.getFirst();
            // A rotation can commit after Bearer authentication but before this lock.
            // Revoke its descendants too so the concurrent logout cannot leave it alive.
            revokeDescendants(claims.userId(),claims.sessionId());
            return !session.revoked() && session.expiresAt().isAfter(Instant.now());
        });
        if(!Boolean.TRUE.equals(valid)) throw new BusinessException(CommonErrorCode.UNAUTHENTICATED);
    }

    private void lockMember(UUID userId) {
        if(jdbc.query("SELECT id FROM users WHERE id=? FOR UPDATE",(rs,n)->rs.getObject(1,UUID.class),userId).isEmpty())
            throw new BusinessException(CommonErrorCode.UNAUTHENTICATED);
    }

    private void revokeDescendants(UUID userId,UUID sessionId) {
        jdbc.update("""
            WITH RECURSIVE family(id) AS (
                SELECT id FROM sessions WHERE id=? AND user_id=?
                UNION ALL
                SELECT s.id FROM sessions s JOIN family f ON s.rotated_from_id=f.id WHERE s.user_id=?
            )
            UPDATE sessions SET revoked_at=COALESCE(revoked_at,?) WHERE id IN (SELECT id FROM family)
            """,sessionId,userId,userId,Timestamp.from(Instant.now()));
    }

    private record StoredSession(UUID id,Instant expiresAt,boolean revoked) { }
}
