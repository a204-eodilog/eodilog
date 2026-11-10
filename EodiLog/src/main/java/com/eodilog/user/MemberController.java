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
    @PatchMapping @Operation(summary="프로필 수정·닉네임으로 가입 완료",description="본인·가입 대기 허용. 보낸 필드만 바꾼다: nickname(공백 제거 후 1~50자), accountVisibility, profileImageAssetId(본인 READY PROFILE 파일, null이면 지움), ageBand(TEENS~SIXTIES_PLUS, null이면 지움, 본인에게만 보임), ageUseConsent. 가입 대기 사용자는 nickname이 필수이며 저장하면 같은 토큰으로 즉시 서비스 접근 가능하다. 공개(PUBLIC)로 바꾸면 받은 팔로우 요청을 모두 수락하고(알림 없음), 비공개(PRIVATE)로 바꿔도 기존 팔로워는 유지한다. 빈 본문·표에 없는 필드와 profileImageAssetId·ageBand 외 null은 400. 한 필드라도 실패하면 아무것도 저장하지 않는다.")
    @ApiResponse(responseCode="200",description="저장된 본인 정보")
    @ApiResponse(responseCode="400",description="INVALID_PROFILE_IMAGE: 없는·남의·PROFILE 용도가 아닌·업로드 확인 전 파일, VALIDATION_ERROR: 그 밖의 잘못된 값")
    public DataResponse<MemberStore.MyProfile> update(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user,@RequestBody ProfilePatch request) { return new DataResponse<>(profiles.update(user.userId(),request)); }
}
