package com.eodilog.domain.auth;

import com.eodilog.global.common.response.DataResponse;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import io.swagger.v3.oas.annotations.*;
import io.swagger.v3.oas.annotations.tags.Tag;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import static com.eodilog.domain.auth.AuthDtos.*;

@RestController
@RequestMapping("/api/v1/auth/oauth/{provider}")
@Tag(name="인증",description="Expo 외부 브라우저 카카오 인가 코드 로그인")
public class AuthController {
    private final AuthService service;
    public AuthController(AuthService service) { this.service=service; }
    @PostMapping("/authorization-requests") @SecurityRequirements
    @Operation(summary="카카오 인가 시작",description="공개. 앱은 verifier를 보관하고 S256 challenge를 보낸다. 응답 URL을 외부 브라우저에서 연다.")
    @ApiResponse(responseCode="201",description="일회성 인가 요청 생성")
    public ResponseEntity<DataResponse<OAuthAuthorization>> start(@Parameter(description="KAKAO",example="KAKAO") @PathVariable String provider,@Valid @RequestBody AuthorizationRequest request) { return ResponseEntity.status(201).body(new DataResponse<>(service.start(provider,request))); }
    @PostMapping("/sessions") @SecurityRequirements
    @Operation(summary="인가 코드로 로그인",description="공개. redirect의 code/state와 앱의 verifier를 교환한다. 컨텍스트는 일회 소비한다. 받은 JWT를 Authorize에 넣어 /me를 호출한다.")
    @ApiResponse(responseCode="200",description="서비스 세션 발급")
    @ApiResponse(responseCode="503",description="PROVIDER_UNAVAILABLE: 카카오 오류 또는 시간 초과")
    public DataResponse<Session> exchange(@Parameter(description="KAKAO",example="KAKAO") @PathVariable String provider,@Valid @RequestBody OAuthExchange request) { return new DataResponse<>(service.exchange(provider,request)); }
}
