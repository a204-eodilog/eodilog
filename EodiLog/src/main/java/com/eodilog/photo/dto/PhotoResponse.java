package com.eodilog.photo.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Schema(description = "등록된 여행 사진. 비공개 EXIF는 포함하지 않는다")
public record PhotoResponse(
        @Schema(description = "사진 ID", example = "019a0000-0000-7000-8000-000000000005") UUID id,
        @Schema(description = "파일 ID", example = "019a0000-0000-7000-8000-000000000003") UUID assetId,
        @Schema(description = "여행 ID", example = "019a0000-0000-7000-8000-000000000001") UUID tripId,
        @Schema(description = "업로드 출처 배치 ID", example = "019a0000-0000-7000-8000-000000000002") UUID batchId,
        @Schema(description = "업로더 멤버 ID", example = "019a0000-0000-7000-8000-000000000006") UUID uploaderMemberId,
        @Schema(description = "연결한 장소 ID", example = "019a0000-0000-7000-8000-000000000004") UUID placeId,
        @Schema(description = "사용자가 지정한 촬영 시각(UTC), 미지정 null", example = "2026-11-06T12:00:00Z") Instant capturedAt,
        @Schema(description = "사진 주제 LANDSCAPE/FOOD/PEOPLE/OTHER, 이름 순 정렬", example = "[\"FOOD\"]") List<String> topics,
        @Schema(description = "사진 그룹(현재 미지원, null)", example = "null") UUID groupId,
        @Schema(description = "사진 버전", example = "1") long version) { }
