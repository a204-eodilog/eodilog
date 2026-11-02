package com.eodilog.job;

import java.util.UUID;
import com.eodilog.global.common.response.DataResponse;
import com.eodilog.global.security.AuthUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/jobs")
@Tag(name = "작업", description = "비동기 작업 상태 조회")
public class JobController {
    private final JobService service;
    public JobController(JobService service) { this.service = service; }
    @GetMapping("/{jobId}")
    @Operation(summary = "작업 조회", description = "활성 계정과 kind별 현재 권한을 확인한다. 정리는 최초 요청자만 이탈 후에도 최소 상태를 조회한다. 접근 불가 작업은 404로 숨긴다.")
    @ApiResponse(responseCode = "200", description = "작업 조회 성공")
    @ApiResponse(responseCode = "404", description = "JOB_NOT_FOUND: 없거나 조회할 수 없는 작업")
    public DataResponse<Job> get(@AuthenticationPrincipal AuthUser user,
        @Parameter(description = "작업 ID(UUID)") @PathVariable UUID jobId) {
        return DataResponse.of(service.get(user.userId(), jobId));
    }
}
