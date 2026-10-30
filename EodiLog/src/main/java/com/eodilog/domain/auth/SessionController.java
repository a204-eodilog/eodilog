package com.eodilog.domain.auth;

import com.eodilog.global.common.response.DataResponse;
import com.eodilog.global.common.error.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import static com.eodilog.domain.auth.AuthDtos.*;

@RestController
@RequestMapping("/api/v1/auth")
@Tag(name="인증",description="서비스 세션 발급·갱신·현재 세션 로그아웃")
public class SessionController {
    private final AuthService service;
    public SessionController(AuthService service) { this.service=service; }

    @PostMapping("/sessions/refresh") @SecurityRequirements
    @Operation(summary="서비스 토큰 갱신",description="Bearer 없이 리프레시 토큰으로 인증한다. 가입 대기도 허용한다. 이전 두 토큰은 즉시 폐기하며 재사용 시 해당 로그인 후속 세션도 폐기한다. 앱은 갱신 요청을 직렬화한다.")
    @ApiResponse(responseCode="200",description="새 서비스 세션. isNewUser=false")
    @ApiResponse(responseCode="401",description="UNAUTHENTICATED: 없는·만료·폐기·재사용 토큰 또는 비활성 회원",
        content=@Content(mediaType="application/json",schema=@Schema(implementation=ErrorResponse.class)))
    public DataResponse<Session> refresh(@Valid @RequestBody RefreshRequest request) {
        return DataResponse.of(service.refresh(request));
    }

    @DeleteMapping("/session")
    @Operation(summary="현재 세션 로그아웃",description="유효한 Bearer의 현재 세션을 폐기한다. 가입 대기도 허용하며 다른 기기 로그인은 유지한다.")
    @ApiResponse(responseCode="204",description="현재 세션 폐기, 응답 본문 없음")
    public ResponseEntity<Void> logout(@Parameter(hidden=true) @RequestAttribute(name=BearerFilter.SESSION_CLAIMS_ATTRIBUTE,required=false) Tokens.Claims claims) {
        if(claims==null) throw new BusinessException(CommonErrorCode.UNAUTHENTICATED);
        service.logout(claims);
        return ResponseEntity.noContent().build();
    }
}
