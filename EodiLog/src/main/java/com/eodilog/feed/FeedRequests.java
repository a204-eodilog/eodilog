package com.eodilog.feed;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonSetter;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.*;
import java.util.*;

public final class FeedRequests {
    private FeedRequests() { }
    public record FeedWrite(
        @NotBlank @Schema(description="게시할 제목", requiredMode=Schema.RequiredMode.REQUIRED) String title,
        @NotNull @Schema(description="본문. 빈 문자열 허용", example="", requiredMode=Schema.RequiredMode.REQUIRED) String body) { }
    public record VisibilityWrite(
        @NotNull @Schema(description="본인 경로에서 숨길 회원 전체 목록", requiredMode=Schema.RequiredMode.REQUIRED) List<@NotNull UUID> hiddenViewerUserIds,
        @NotNull @Min(1) @Schema(description="조회한 개인 설정 버전", example="1", requiredMode=Schema.RequiredMode.REQUIRED) Long expectedVersion) { }
    @Schema(description="공동 피드 내리기와 내 기록 삭제 요청")
    public record OwnRecordsDelete(
        @NotNull @Min(1) @Schema(description="조회한 공동 피드 버전", example="1", requiredMode=Schema.RequiredMode.REQUIRED) Long expectedVersion) { }
    public static class FeedPatch {
        @NotNull @Min(1) @Schema(description="조회한 공동 피드 버전", example="1", requiredMode=Schema.RequiredMode.REQUIRED) private Long expectedVersion;
        @Schema(description="변경할 제목. 생략하면 유지") private String title;
        @Schema(description="변경할 본문. 빈 문자열 허용, 생략하면 유지") private String body;
        private boolean explicitNull;
        public Long expectedVersion() { return expectedVersion; }
        public String title() { return title; }
        public String body() { return body; }
        @JsonIgnore public boolean hasExplicitNull() { return explicitNull; }
        @JsonSetter("expectedVersion") public void setExpectedVersion(Long v) { expectedVersion=v; }
        @JsonSetter("title") public void setTitle(String v) { title=v; explicitNull |= v==null; }
        @JsonSetter("body") public void setBody(String v) { body=v; explicitNull |= v==null; }
    }
}
