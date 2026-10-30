package com.eodilog.domain.auth;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;
import jakarta.validation.constraints.*;

@Validated
@ConfigurationProperties("app.auth")
public record AuthProperties(@NotBlank String kakaoClientId, @NotBlank String kakaoClientSecret,
        @NotEmpty List<@NotBlank String> allowedRedirects, @NotBlank @Size(min=32) String jwtSecret,
        @NotBlank String issuer, @Positive long accessSeconds, @Positive long refreshSeconds,
        @Positive long attemptSeconds) { }
