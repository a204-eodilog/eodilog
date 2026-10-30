package com.eodilog.domain.auth;

import com.eodilog.global.common.error.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.Instant;
import java.util.*;
import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.*;
import com.nimbusds.jwt.*;
import org.springframework.stereotype.Component;

@Component
public class Tokens {
    private final AuthProperties properties;
    private final SecureRandom random=new SecureRandom();
    public Tokens(AuthProperties properties) { this.properties=properties; }
    public String random() { byte[] bytes=new byte[32]; random.nextBytes(bytes); return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); }
    public static String hash(String value) { try { return Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.US_ASCII))); } catch(NoSuchAlgorithmException e) { throw new IllegalStateException(e); } }
    public String issue(UUID userId,UUID sessionId) {
        try {
            Instant now=Instant.now();
            var jwt=new SignedJWT(new JWSHeader(JWSAlgorithm.HS256),new JWTClaimsSet.Builder().issuer(properties.issuer()).subject(userId.toString()).jwtID(sessionId.toString()).issueTime(Date.from(now)).expirationTime(Date.from(now.plusSeconds(properties.accessSeconds()))).build());
            jwt.sign(new MACSigner(properties.jwtSecret().getBytes(StandardCharsets.UTF_8))); return jwt.serialize();
        } catch(JOSEException e) { throw new IllegalStateException("Token signing failed",e); }
    }
    public record Claims(UUID userId, UUID sessionId) { }
    public Claims verify(String token) {
        try {
            var jwt=SignedJWT.parse(token); var c=jwt.getJWTClaimsSet();
            if(!JWSAlgorithm.HS256.equals(jwt.getHeader().getAlgorithm()) || !jwt.verify(new MACVerifier(properties.jwtSecret().getBytes(StandardCharsets.UTF_8))) || !properties.issuer().equals(c.getIssuer()) || c.getExpirationTime()==null || !c.getExpirationTime().toInstant().isAfter(Instant.now())) throw new BusinessException(CommonErrorCode.UNAUTHENTICATED);
            return new Claims(UUID.fromString(c.getSubject()),UUID.fromString(c.getJWTID()));
        } catch(Exception e) { throw new BusinessException(CommonErrorCode.UNAUTHENTICATED); }
    }
}
