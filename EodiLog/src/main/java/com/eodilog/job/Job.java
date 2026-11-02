package com.eodilog.job;

import java.time.Instant;
import java.util.UUID;
import tools.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "권한 확인을 거친 작업 상태. 입력과 실행 제어 정보는 공개하지 않는다")
public record Job(
    @Schema(description = "작업 ID", example = "019a0000-0000-7000-8000-000000000001", requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
    @Schema(description = "작업 종류", example = "LEAVE_CLEANUP", requiredMode = Schema.RequiredMode.REQUIRED) JobKind kind,
    @Schema(description = "작업 상태", example = "QUEUED", requiredMode = Schema.RequiredMode.REQUIRED) JobStatus status,
    @Schema(description = "진행률 0~100", example = "0", requiredMode = Schema.RequiredMode.REQUIRED) int progress,
    @Schema(description = "kind 정책이 허용한 공개 결과", nullable = true, requiredMode = Schema.RequiredMode.REQUIRED) JsonNode result,
    @Schema(description = "안전한 오류, 없으면 null", nullable = true, requiredMode = Schema.RequiredMode.REQUIRED) Failure error,
    @Schema(description = "접수 시각", example = "2026-11-02T00:00:00Z", requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt,
    @Schema(description = "종료 시각", example = "2026-11-02T00:01:00Z", nullable = true, requiredMode = Schema.RequiredMode.REQUIRED) Instant finishedAt) {
    public record Failure(
        @Schema(description = "서버가 정한 오류 코드", example = "TIMEOUT", requiredMode = Schema.RequiredMode.REQUIRED) String code,
        @Schema(description = "안전한 오류 문구", example = "작업 시간이 초과되었습니다.", requiredMode = Schema.RequiredMode.REQUIRED) String message) { }
}
