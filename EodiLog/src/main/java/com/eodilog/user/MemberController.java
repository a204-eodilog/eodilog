package com.eodilog.user;

import com.eodilog.global.common.response.DataResponse;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import io.swagger.v3.oas.annotations.*;
import io.swagger.v3.oas.annotations.tags.Tag;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import com.eodilog.global.security.AuthUser;

@RestController @RequestMapping("/api/v1/me")
@Tag(name="프로필",description="본인 조회, 닉네임 가입 완료, 프로필 수정")
public class MemberController {
    private final MemberStore members;
    private final ProfileService profiles;
    public MemberController(MemberStore members, ProfileService profiles) { this.members=members; this.profiles=profiles; }
    @GetMapping @Operation(summary="내 정보 조회",description="본인. 가입 대기 토큰으로도 조회 가능하다.")
    @ApiResponse(responseCode="200",description="본인 정보")
    public DataResponse<MemberStore.MyProfile> me(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user) { return new DataResponse<>(members.profile(user.userId())); }
    @PatchMapping @Operation(summary="프로필 수정·닉네임으로 가입 완료",description="본인·가입 대기 허용. 보낸 필드만 바꾼다: nickname(공백 제거 후 1~50자), accountVisibility. 가입 대기 사용자는 nickname이 필수이며 저장하면 같은 토큰으로 즉시 서비스 접근 가능하다. 공개(PUBLIC)로 바꾸면 받은 팔로우 요청을 모두 수락하고(알림 없음), 비공개(PRIVATE)로 바꿔도 기존 팔로워는 유지한다. 빈 본문·null·표에 없는 필드는 400.")
    @ApiResponse(responseCode="200",description="저장된 본인 정보")
    public DataResponse<MemberStore.MyProfile> update(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user,@RequestBody ProfilePatch request) { return new DataResponse<>(profiles.update(user.userId(),request)); }
}
