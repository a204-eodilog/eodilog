package com.eodilog.user.preference;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.List;

@Schema(description = "본인의 직접 입력·추론 취향과 별도 동의 설정")
public record Preferences(
        @Schema(description = "직접 입력 목록") List<Item> explicitItems,
        @Schema(description = "추론 목록") List<Item> inferredItems,
        @Schema(description = "추론 허용", example = "false") boolean allowInference,
        @Schema(description = "전역 공유 범위", example = "NONE") Scope sharingScope,
        @Schema(description = "취향 마지막 변경 시각. 직접 입력·추론 허용·공유 범위가 실제로 바뀌거나 추론 항목 삭제·추론 결과 저장 때 바뀐다(프로필 수정과 무관). 아직 취향을 저장한 적 없으면 회원 정보의 마지막 변경 시각", example = "2026-11-09T00:00:00Z") Instant updatedAt) {
    @Schema(description = "취향 키와 값. 직접 입력은 공백 정리 후 같은 값인 최대 20자 자유 입력")
    public record Item(@Schema(description = "취향 키", example = "카페") String key,
                       @Schema(description = "취향 값", example = "카페") String value) {}
    public enum Scope { EXPLICIT_ONLY, EXPLICIT_AND_INFERRED, NONE }
    public enum TripScope { EXPLICIT_ONLY, EXPLICIT_AND_INFERRED, NONE, INHERIT }
    @Schema(description = "직접 입력 전체 교체 및 동의 설정")
    public record Write(
            @NotNull @Valid @Schema(description = "최대 20개 직접 취향", requiredMode = Schema.RequiredMode.REQUIRED) List<@NotNull Item> explicitItems,
            @NotNull @Schema(description = "추론 동의", example = "false", requiredMode = Schema.RequiredMode.REQUIRED) Boolean allowInference,
            @NotNull @Schema(description = "전역 공유 범위", example = "NONE", requiredMode = Schema.RequiredMode.REQUIRED) Scope sharingScope) {}
    @Schema(description = "본인 여행별 공유 동의")
    public record ConsentWrite(@NotNull @Schema(description = "여행 공유 범위", example = "INHERIT", requiredMode = Schema.RequiredMode.REQUIRED) TripScope scope) {}
    @Schema(description = "여행 override 우선 적용 결과. 추론 불허 시 추론 활용은 제외")
    public record Consent(@Schema(description = "저장한 여행 범위") TripScope scope,
                          @Schema(description = "실제 활용 가능한 범위") Scope effectiveScope) {}
}
