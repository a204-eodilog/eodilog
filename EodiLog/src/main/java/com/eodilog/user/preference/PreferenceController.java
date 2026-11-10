package com.eodilog.user.preference;

import com.eodilog.global.common.response.DataResponse;
import com.eodilog.global.security.AuthUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@Tag(name = "취향", description = "본인 취향·추론·공유 동의 관리")
@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class PreferenceController {
    private final PreferenceService service;
    @Operation(summary = "본인 취향 조회", description = "본인만 조회한다. 읽기 전용이며 추론을 실행하지 않는다")
    @ApiResponse(responseCode = "200", description = "조회 성공")
    @GetMapping("/me/preferences")
    public DataResponse<Preferences> get(@AuthenticationPrincipal AuthUser user) { return DataResponse.of(service.get(user.userId())); }
    @Operation(summary = "본인 취향 교체", description = "직접 입력만 전체 교체한다. 추론 허용 또는 직접 취향 변경은 비동기 갱신한다")
    @ApiResponse(responseCode = "200", description = "저장 성공")
    @PutMapping("/me/preferences")
    public DataResponse<Preferences> put(@AuthenticationPrincipal AuthUser user, @Valid @RequestBody Preferences.Write body) {
        return DataResponse.of(service.put(user.userId(), body));
    }
    @Operation(summary = "추론 취향 삭제", description = "본인 추론 항목을 삭제하고 동일한 고유 저장 장소 구성에서 재생성을 거부한다")
    @ApiResponse(responseCode = "204", description = "삭제 성공")
    @DeleteMapping("/me/preferences/inferred/{key}")
    @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal AuthUser user, @PathVariable String key) { service.delete(user.userId(), key); }
    @Operation(summary = "여행별 본인 취향 공유 동의", description = "ACTIVE 본인 멤버만 수정한다. 명시적 여행 범위가 전역보다 우선하며 추론 불허를 우회하지 않는다")
    @ApiResponse(responseCode = "200", description = "동의 저장 성공")
    @PutMapping("/trips/{tripId}/members/me/preference-consent")
    public DataResponse<Preferences.Consent> consent(@AuthenticationPrincipal AuthUser user, @PathVariable UUID tripId,
            @Valid @RequestBody Preferences.ConsentWrite body) { return DataResponse.of(service.consent(user.userId(), tripId, body.scope())); }
}
