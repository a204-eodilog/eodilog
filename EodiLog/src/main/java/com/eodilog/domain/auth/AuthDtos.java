package com.eodilog.domain.auth;

import java.time.Instant;
import java.util.UUID;
import jakarta.validation.constraints.*;
import io.swagger.v3.oas.annotations.media.Schema;
import com.eodilog.user.MemberStore.MyProfile;

public final class AuthDtos {
    private AuthDtos() { }
    @Schema(description="Expo 앱 인가 시작. verifier를 앱에 보관한다.")
    public record AuthorizationRequest(
        @NotBlank @Size(max=500) @Schema(description="등록된 앱 redirect URI",example="https://app.example.com/oauth/kakao",requiredMode=Schema.RequiredMode.REQUIRED) String redirectUri,
        @NotBlank @Pattern(regexp="[A-Za-z0-9_-]{43}") @Schema(description="S256 challenge, 패딩 없는 base64url",example="E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",requiredMode=Schema.RequiredMode.REQUIRED) String codeChallenge) { }
    public record OAuthAuthorization(
        @Schema(description="일회성 인가 요청 UUID",requiredMode=Schema.RequiredMode.REQUIRED) UUID authorizationId,
        @Schema(description="외부 브라우저에서 열 카카오 인가 URL",requiredMode=Schema.RequiredMode.REQUIRED) String authorizationUrl,
        @Schema(description="redirect에서 확인할 state",requiredMode=Schema.RequiredMode.REQUIRED) String state,
        @Schema(description="UTC 만료 시각",example="2026-10-28T03:05:00Z",requiredMode=Schema.RequiredMode.REQUIRED) Instant expiresAt) { }
    public record OAuthExchange(
        @NotNull @Schema(description="인가 요청 UUID",requiredMode=Schema.RequiredMode.REQUIRED) UUID authorizationId,
        @NotBlank @Size(max=2048) @Schema(description="redirect의 인가 코드",example="authorization-code",requiredMode=Schema.RequiredMode.REQUIRED) String code,
        @NotBlank @Size(max=500) @Schema(description="시작과 동일한 redirect URI",example="https://app.example.com/oauth/kakao",requiredMode=Schema.RequiredMode.REQUIRED) String redirectUri,
        @NotBlank @Size(max=256) @Schema(description="redirect의 state",requiredMode=Schema.RequiredMode.REQUIRED) String state,
        @NotBlank @Pattern(regexp="[A-Za-z0-9._~-]{43,128}") @Schema(description="앱에 보관한 PKCE verifier",example="dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",requiredMode=Schema.RequiredMode.REQUIRED) String codeVerifier) { }
    public record Session(
        @Schema(description="서비스 Bearer JWT",requiredMode=Schema.RequiredMode.REQUIRED) String accessToken,
        @Schema(description="갱신 토큰. 갱신 endpoint는 미제공",requiredMode=Schema.RequiredMode.REQUIRED) String refreshToken,
        @Schema(description="access token 유효기간(초)",example="3600",requiredMode=Schema.RequiredMode.REQUIRED) long expiresIn,
        @Schema(description="내 정보",requiredMode=Schema.RequiredMode.REQUIRED) MyProfile user,
        @Schema(description="최초 사용자 생성 여부",example="true",requiredMode=Schema.RequiredMode.REQUIRED) boolean isNewUser) { }
    public record NicknamePatch(@NotBlank @Schema(description="공백 제거 후 1~50자 닉네임, 다른 필드는 거부",example="여행자",requiredMode=Schema.RequiredMode.REQUIRED) String nickname) { }
}
