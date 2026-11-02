package com.eodilog.job;

import java.util.UUID;
import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "비동기 작업 접수 정보")
public record JobRef(
    @Schema(description = "작업 ID", example = "019a0000-0000-7000-8000-000000000001", requiredMode = Schema.RequiredMode.REQUIRED) UUID jobId,
    @Schema(description = "접수 상태", example = "QUEUED", allowableValues = {"QUEUED"}, requiredMode = Schema.RequiredMode.REQUIRED) JobStatus status,
    @Schema(description = "작업 조회 경로", example = "/api/v1/jobs/019a0000-0000-7000-8000-000000000001", requiredMode = Schema.RequiredMode.REQUIRED) String statusUrl) {
    static JobRef queued(UUID id) { return new JobRef(id, JobStatus.QUEUED, "/api/v1/jobs/" + id); }
}
