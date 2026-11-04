package com.eodilog.user.settings;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonSetter;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import com.eodilog.user.settings.UserSettings.AiMode;
import com.eodilog.user.settings.UserSettings.WeatherMode;

// Setter invocation records explicit null separately from omitted PATCH fields.
public class SettingsPatch {
    @NotNull @Min(1)
    @Schema(description = "조회한 설정 버전", example = "1", requiredMode = Schema.RequiredMode.REQUIRED)
    private Long expectedVersion;
    @Valid @Schema(description = "변경할 AI 모드만 포함") private Ai ai;
    @Valid @Schema(description = "변경할 알림만 포함") private Notifications notifications;
    private boolean nullSent;

    public Long expectedVersion() { return expectedVersion; }
    public Ai ai() { return ai; }
    public Notifications notifications() { return notifications; }
    @JsonIgnore public boolean hasExplicitNull() {
        return nullSent || ai != null && ai.hasExplicitNull() || notifications != null && notifications.hasExplicitNull();
    }
    @JsonSetter("expectedVersion") public void setExpectedVersion(Long value) { expectedVersion = value; }
    @JsonSetter("ai") public void setAi(Ai value) { ai = value; nullSent |= value == null; }
    @JsonSetter("notifications") public void setNotifications(Notifications value) { notifications = value; nullSent |= value == null; }

    public static class Ai {
        @Schema(description = "사진 분류", example = "AUTO") private AiMode photoClassification;
        @Schema(description = "방문 감지", example = "OFF") private AiMode visitDetection;
        @Schema(description = "장소 추출", example = "CONFIRM") private AiMode placeExtraction;
        @Schema(description = "준비물 추천", example = "CONFIRM") private AiMode checklist;
        @Schema(description = "날씨 제안", example = "SUGGEST_ONLY") private WeatherMode weather;
        private boolean nullSent;
        public AiMode photoClassification() { return photoClassification; }
        public AiMode visitDetection() { return visitDetection; }
        public AiMode placeExtraction() { return placeExtraction; }
        public AiMode checklist() { return checklist; }
        public WeatherMode weather() { return weather; }
        @JsonIgnore public boolean hasExplicitNull() { return nullSent; }
        @JsonSetter("photoClassification") public void setPhotoClassification(AiMode value) { photoClassification = value; nullSent |= value == null; }
        @JsonSetter("visitDetection") public void setVisitDetection(AiMode value) { visitDetection = value; nullSent |= value == null; }
        @JsonSetter("placeExtraction") public void setPlaceExtraction(AiMode value) { placeExtraction = value; nullSent |= value == null; }
        @JsonSetter("checklist") public void setChecklist(AiMode value) { checklist = value; nullSent |= value == null; }
        @JsonSetter("weather") public void setWeather(WeatherMode value) { weather = value; nullSent |= value == null; }
    }

    public static class Notifications {
        @Schema(description = "팔로우 요청 알림", example = "false") private Boolean followRequests;
        @Schema(description = "투표 및 코스 알림", example = "true") private Boolean voteCourse;
        @Schema(description = "여행 변경 알림", example = "true") private Boolean tripChanges;
        private boolean nullSent;
        public Boolean followRequests() { return followRequests; }
        public Boolean voteCourse() { return voteCourse; }
        public Boolean tripChanges() { return tripChanges; }
        @JsonIgnore public boolean hasExplicitNull() { return nullSent; }
        @JsonSetter("followRequests") public void setFollowRequests(Boolean value) { followRequests = value; nullSent |= value == null; }
        @JsonSetter("voteCourse") public void setVoteCourse(Boolean value) { voteCourse = value; nullSent |= value == null; }
        @JsonSetter("tripChanges") public void setTripChanges(Boolean value) { tripChanges = value; nullSent |= value == null; }
    }
}
