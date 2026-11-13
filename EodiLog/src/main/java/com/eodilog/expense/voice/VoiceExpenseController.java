package com.eodilog.expense.voice;
import com.eodilog.global.common.error.*;
import com.eodilog.global.common.response.DataResponse;
import com.eodilog.global.security.AuthUser;
import com.eodilog.trip.controller.CurrentUser;
import com.eodilog.job.JobRef;
import io.swagger.v3.oas.annotations.*;
import io.swagger.v3.oas.annotations.tags.Tag;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.http.*;
@RestController @RequiredArgsConstructor
@RequestMapping("/api/v1/trips/{tripId}/expense-voice-drafts")
@Tag(name="경비",description="음성 경비 초안과 사용자 확인 후 등록")
public class VoiceExpenseController {
    private final VoiceExpenseService service;
    @PostMapping(consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary="음성 경비 초안 요청",description="현재 ACTIVE 멤버. Idempotency-Key 필수. audio/mp4 M4A/AAC 녹음 한 개, 최대 60초·10MiB. 최대 10건의 초안을 생성하며 경비는 저장하지 않는다. GET /jobs/{jobId}는 요청자만 조회 가능하고 종료 후 1시간 뒤 만료된다. 원음은 처리 종료 후 삭제하며 자동 재인식하지 않는다.")
    @ApiResponse(responseCode="202",description="VOICE_EXPENSE_DRAFT 작업 접수")
    @ApiResponse(responseCode="422",description="INPUT_LIMIT_EXCEEDED: 녹음 시간·크기 초과")
    @ApiResponse(responseCode="409",description="IDEMPOTENCY_KEY_REUSED 또는 REQUEST_IN_PROGRESS")
    @ApiResponse(responseCode="503",description="AUDIO_VALIDATOR_UNAVAILABLE 또는 STORAGE_UNAVAILABLE")
    public ResponseEntity<DataResponse<JobRef>> submit(@Parameter(hidden=true) @org.springframework.security.core.annotation.AuthenticationPrincipal AuthUser user,
        @PathVariable UUID tripId,@RequestHeader(name="Idempotency-Key",required=false) String key,
        @RequestPart(name="audio",required=false) MultipartFile audio,org.springframework.web.multipart.MultipartHttpServletRequest request) throws Exception {
        var files = request.getMultiFileMap();
        if(files.size()!=1 || !files.containsKey("audio") || files.get("audio").size()!=1
            || !request.getParameterMap().isEmpty()
            || request.getParts().stream().anyMatch(p->!p.getName().equals("audio")))
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR,"audio 파일 한 개만 보내 주세요.");
        return ResponseEntity.accepted().body(DataResponse.of(service.submit(CurrentUser.requireUserId(user),tripId,key,audio)));
    }
}
