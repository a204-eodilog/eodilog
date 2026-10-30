package com.eodilog.user;

import com.eodilog.global.common.error.*;
import java.util.UUID;
import com.eodilog.user.dto.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import com.eodilog.global.common.error.BusinessException;
import io.swagger.v3.oas.annotations.media.Schema;

@Repository
public class MemberStore {
    private final JdbcTemplate jdbc;
    public MemberStore(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    public record MyProfile(
        @Schema(description="사용자 UUID",example="3f2b8c1e-5d4a-4e7b-9c1f-2a6d8e0b7c45",requiredMode=Schema.RequiredMode.REQUIRED) UUID id,
        @Schema(description="닉네임, 가입 대기 시 빈 문자열",example="여행자",requiredMode=Schema.RequiredMode.REQUIRED) String nickname,
        @Schema(description="프로필 이미지 URL",nullable=true,requiredMode=Schema.RequiredMode.REQUIRED) String profileImageUrl,
        @Schema(description="계정 공개 범위",example="PRIVATE",requiredMode=Schema.RequiredMode.REQUIRED) AccountVisibility accountVisibility,
        @Schema(description="팔로우 상태",example="NONE",requiredMode=Schema.RequiredMode.REQUIRED) FollowStatus followingStatus,
        @Schema(description="역방향 팔로우 상태",example="NONE",requiredMode=Schema.RequiredMode.REQUIRED) FollowStatus followedByStatus,
        @Schema(description="비공개 연령대",nullable=true,requiredMode=Schema.RequiredMode.REQUIRED) String ageBand,
        @Schema(description="연령 활용 동의",example="false",requiredMode=Schema.RequiredMode.REQUIRED) boolean ageUseConsent,
        @Schema(description="가입 완료 여부",example="true",requiredMode=Schema.RequiredMode.REQUIRED) boolean profileCompleted,
        @Schema(description="프로필 경로",example="/users/3f2b8c1e-5d4a-4e7b-9c1f-2a6d8e0b7c45",requiredMode=Schema.RequiredMode.REQUIRED) String profileUrl) { }
    public MyProfile profile(UUID id) {
        var rows=jdbc.query("SELECT * FROM users WHERE id=? AND status='ACTIVE'",(rs,n)->new MyProfile(id,rs.getString("nickname"),null,AccountVisibility.valueOf(rs.getString("account_visibility")),FollowStatus.NONE,FollowStatus.NONE,rs.getString("age_band"),rs.getBoolean("age_use_consent"),rs.getBoolean("profile_completed"),"/users/"+id),id);
        if(rows.isEmpty()) throw new BusinessException(CommonErrorCode.UNAUTHENTICATED);
        return rows.getFirst();
    }
    public MyProfile complete(UUID id,String nickname) {
        String clean=nickname==null ? "" : nickname.strip();
        if(clean.isEmpty() || clean.indexOf('\0')>=0 || clean.codePointCount(0,clean.length())>50) throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
        if(jdbc.update("UPDATE users SET nickname=?,profile_completed=true,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'",clean,id)!=1) throw new BusinessException(CommonErrorCode.UNAUTHENTICATED);
        return profile(id);
    }
}
