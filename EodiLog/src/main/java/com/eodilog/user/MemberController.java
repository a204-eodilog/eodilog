package com.eodilog.user;

import com.eodilog.global.common.response.DataResponse;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import io.swagger.v3.oas.annotations.*;
import io.swagger.v3.oas.annotations.tags.Tag;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import com.eodilog.global.security.AuthUser;
import com.eodilog.domain.auth.AuthDtos.*;

@RestController @RequestMapping("/api/v1/me")
@Tag(name="프로필",description="본인 조회와 닉네임 가입 완료")
public class MemberController {
    private final MemberStore members;
    public MemberController(MemberStore members) { this.members=members; }
    @GetMapping @Operation(summary="내 정보 조회",description="본인. 가입 대기 토큰으로도 조회 가능하다.")
    @ApiResponse(responseCode="200",description="본인 정보")
    public DataResponse<MemberStore.MyProfile> me(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user) { return new DataResponse<>(members.profile(user.userId())); }
    @PatchMapping @Operation(summary="닉네임으로 가입 완료",description="본인. 공백 제거 후 1~50자 닉네임만 지원. 다른 수정 필드는 거부. 같은 토큰으로 즉시 서비스 접근 가능하다.")
    @ApiResponse(responseCode="200",description="닉네임 저장 및 가입 완료")
    public DataResponse<MemberStore.MyProfile> complete(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user,@Valid @RequestBody NicknamePatch request) { return new DataResponse<>(members.complete(user.userId(),request.nickname())); }
}
