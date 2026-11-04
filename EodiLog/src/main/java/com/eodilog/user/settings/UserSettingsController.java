package com.eodilog.user.settings;

import com.eodilog.global.common.response.DataResponse;
import com.eodilog.global.security.AuthUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/me/settings")
@Tag(name = "프로필", description = "본인 AI 및 알림 설정")
public class UserSettingsController {
    private final UserSettingsService settings;

    public UserSettingsController(UserSettingsService settings) { this.settings = settings; }

    @GetMapping
    @Operation(summary = "내 설정 조회", description = "가입 완료한 본인만 조회한다. 최초 조회 시 기본 설정을 저장한다.")
    @ApiResponse(responseCode = "200", description = "현재 설정")
    public DataResponse<UserSettings> get(@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user) {
        return DataResponse.of(settings.get(user.userId()));
    }

    @PatchMapping
    @Operation(summary = "내 설정 변경", description = "가입 완료한 본인만 변경한다. expectedVersion을 검사하고 제공한 필드만 변경한다.")
    @ApiResponse(responseCode = "200", description = "변경된 설정")
    @ApiResponse(responseCode = "409", description = "VERSION_CONFLICT: 설정 버전 충돌")
    public DataResponse<UserSettings> patch(@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user,
            @Valid @RequestBody SettingsPatch patch) {
        return DataResponse.of(settings.patch(user.userId(), patch));
    }
}
