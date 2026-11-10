package com.eodilog.photo.classification;

import com.eodilog.global.common.response.DataResponse;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.global.security.AuthUser;
import com.eodilog.job.JobRef;
import com.eodilog.photo.dto.*;
import com.eodilog.trip.controller.CurrentUser;
import io.swagger.v3.oas.annotations.*;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController @RequiredArgsConstructor
@Tag(name="사진",description="여행 사진과 AI 분류")
@RequestMapping("/api/v1/trips/{tripId}/photo-classifications")
public class ClassificationController {
    private final ClassificationService service;
    @Operation(summary="AI 사진 분류 요청",description="ACTIVE 멤버가 1~50장의 표시 파일을 분석한다. Idempotency-Key 필수. OFF 차단, AUTO도 명시적 적용이 필요하다.")
    @ApiResponse(responseCode="202",description="PHOTO_CLASSIFICATION 작업 접수")
    @ApiResponse(responseCode="409",description="AI_FEATURE_DISABLED 또는 요청 키 충돌")
    @ApiResponse(responseCode="422",description="INPUT_LIMIT_EXCEEDED: 50장 초과")
    @PostMapping
    public ResponseEntity<DataResponse<JobRef>> request(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user,
            @PathVariable UUID tripId,@RequestHeader(name=IdempotencyService.HEADER_NAME,required=false) String key,
            @Valid @RequestBody PhotoClassificationRequest body) {
        return ResponseEntity.accepted().body(DataResponse.of(service.request(CurrentUser.requireUserId(user),tripId,key,body)));
    }
    @Operation(summary="AI 사진 분류 적용",description="ACTIVE 멤버가 성공 사진을 명시적으로 적용한다. 분석/현재/요청 버전을 검사하며 수동 주제 보정을 보호한다. 작업당 한번, 동일 본문 재요청은 최초 응답을 반환한다.")
    @ApiResponse(responseCode="200",description="적용된 photos")
    @ApiResponse(responseCode="409",description="VERSION_CONFLICT 또는 AI_FEATURE_DISABLED")
    @PostMapping("/{jobId}/apply")
    public DataResponse<PhotoClassificationResponse> apply(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user,
            @PathVariable UUID tripId,@PathVariable UUID jobId,@Valid @RequestBody ApplyPhotoClassificationRequest body) {
        return DataResponse.of(service.apply(CurrentUser.requireUserId(user),tripId,jobId,body));
    }
}
