package com.eodilog.photo.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;

@Schema(description = "삭제 사진을 제외한 여행 전체 집계. 목록 필터와 독립적")
public record PhotoSummaryResponse(
    @Schema(description = "전체 사진 수", example = "10") long totalCount,
    @Schema(description = "장소 미지정 수", example = "2") long unplacedCount,
    @Schema(description = "주제별 사진 수") List<TopicCount> topics,
    @Schema(description = "장소별 사진 수") List<PlaceCount> places,
    @Schema(description = "삭제 사진을 제외한 그룹별 사진 수. 빈 그룹 제외") List<GroupCount> groups) {
    public record TopicCount(@Schema(description = "주제", example = "FOOD") String topic,
                             @Schema(description = "사진 수", example = "3") long count) { }
    public record PlaceCount(@Schema(description = "장소 ID", example = "019a0000-0000-7000-8000-000000000004") UUID placeId,
                             @Schema(description = "사진 수", example = "3") long count) { }
    public record GroupCount(@Schema(description = "그룹 ID") UUID groupId,
                             @Schema(description = "사진 수") long count) { }
}
