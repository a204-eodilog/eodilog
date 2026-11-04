package com.eodilog.user.settings;

import io.swagger.v3.oas.annotations.media.Schema;

public record UserSettings(
        @Schema(description = "설정 버전", example = "1", requiredMode = Schema.RequiredMode.REQUIRED) long version,
        @Schema(description = "AI 기능별 모드", requiredMode = Schema.RequiredMode.REQUIRED) Ai ai,
        @Schema(description = "알림 종류별 사용 여부", requiredMode = Schema.RequiredMode.REQUIRED) Notifications notifications) {

    public enum AiMode { AUTO, CONFIRM, OFF }
    public enum WeatherMode { SUGGEST_ONLY, OFF }

    public record Ai(
            @Schema(description = "사진 분류", example = "CONFIRM", requiredMode = Schema.RequiredMode.REQUIRED) AiMode photoClassification,
            @Schema(description = "방문 감지", example = "CONFIRM", requiredMode = Schema.RequiredMode.REQUIRED) AiMode visitDetection,
            @Schema(description = "장소 추출", example = "CONFIRM", requiredMode = Schema.RequiredMode.REQUIRED) AiMode placeExtraction,
            @Schema(description = "준비물 추천", example = "CONFIRM", requiredMode = Schema.RequiredMode.REQUIRED) AiMode checklist,
            @Schema(description = "날씨 제안", example = "SUGGEST_ONLY", requiredMode = Schema.RequiredMode.REQUIRED) WeatherMode weather) { }

    public record Notifications(
            @Schema(description = "팔로우 요청 알림", example = "true", requiredMode = Schema.RequiredMode.REQUIRED) boolean followRequests,
            @Schema(description = "투표 및 코스 알림", example = "true", requiredMode = Schema.RequiredMode.REQUIRED) boolean voteCourse,
            @Schema(description = "여행 변경 알림", example = "true", requiredMode = Schema.RequiredMode.REQUIRED) boolean tripChanges) { }
}
