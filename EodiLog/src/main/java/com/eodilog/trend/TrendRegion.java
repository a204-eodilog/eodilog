package com.eodilog.trend;

import com.eodilog.region.dto.RegionView;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;

@Schema(description = "기간 안 게시 여행 수 기준 지역 순위 한 줄. 요청자가 볼 수 있는 피드만 센다")
public record TrendRegion(
        @Schema(description = "피드 게시 스냅샷에 담긴 지역(단계를 합치지 않는다)", requiredMode = Schema.RequiredMode.REQUIRED)
        RegionView region,

        @Schema(description = "순위. publishedTripCount가 같으면 같은 순위이고 다음 순위는 그 수만큼 건너뛴다(1,1,3)", example = "1",
                requiredMode = Schema.RequiredMode.REQUIRED)
        int rank,

        @Schema(description = "직전 같은 길이 기간의 순위. 그 기간에 없던 지역이면 null", example = "3", nullable = true)
        Integer previousRank,

        @Schema(description = "previousRank - rank(양수면 상승). previousRank가 null이면 null", example = "2", nullable = true)
        Integer rankChange,

        @Schema(description = "직전 기간 순위에 없던 지역이면 true", example = "false", requiredMode = Schema.RequiredMode.REQUIRED)
        boolean isNew,

        @Schema(description = "기간이 겹치고 요청자가 볼 수 있는 게시 피드(여행) 수", example = "128",
                requiredMode = Schema.RequiredMode.REQUIRED)
        int publishedTripCount,

        @Schema(description = "그중 요청자가 ACCEPTED로 팔로우하는 회원이 현재 ACTIVE 멤버이고 그 회원이 요청자를 숨기지 않은 피드 수", example = "3",
                requiredMode = Schema.RequiredMode.REQUIRED)
        int followingCount,

        @Schema(description = "집계 시작일(요청 값)", example = "2026-10-12", requiredMode = Schema.RequiredMode.REQUIRED)
        LocalDate from,

        @Schema(description = "집계 종료일(요청 값)", example = "2026-11-10", requiredMode = Schema.RequiredMode.REQUIRED)
        LocalDate to,

        @Schema(description = "표본 수: 기간 안 요청자가 볼 수 있고 지역이 하나 이상인 게시 피드 수(지역 중복 없이)", example = "412",
                requiredMode = Schema.RequiredMode.REQUIRED)
        int sampleSize,

        @Schema(description = "집계 시각(요청 시점에 계산한다)", example = "2026-11-10T06:00:00Z", requiredMode = Schema.RequiredMode.REQUIRED)
        Instant updatedAt,

        @Schema(description = "sampleSize가 5 미만이면 true. 모든 줄이 같은 값이다", example = "false",
                requiredMode = Schema.RequiredMode.REQUIRED)
        boolean insufficientData) {
}
