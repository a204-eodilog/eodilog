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
    @Operation(summary="휴대폰 사진 분류 반영",description="ACTIVE 멤버가 휴대폰에서 분류한 본인 사진 1~50장의 주제와 유사 사진 묶음을 한 번에 반영한다. 설정 OFF는 차단, CONFIRM·AUTO는 허용한다. "
            +"모든 사진이 이 여행의 삭제되지 않은 본인 사진이어야 하고, 버전이 하나라도 다르거나 수동 주제 보정 이력이 있으면 아무것도 바꾸지 않는다. "
            +"같은 groupKey를 2장 이상이 쓰면 서버가 새 묶음 ID를 만들고, 1장뿐이면 묶음 없음. 주제는 source=AI로 저장하고 사진 version을 올린다.")
    @ApiResponse(responseCode="200",description="반영된 photos(요청 순서)")
    @ApiResponse(responseCode="400",description="VALIDATION_ERROR: 빈 목록·중복 photoId·잘못된 expectedVersion/topic/groupKey")
    @ApiResponse(responseCode="404",description="TRIP_NOT_FOUND 또는 PHOTO_NOT_FOUND: 없거나 삭제·타인·다른 여행 사진")
    @ApiResponse(responseCode="409",description="VERSION_CONFLICT 또는 AI_FEATURE_DISABLED")
    @ApiResponse(responseCode="422",description="INPUT_LIMIT_EXCEEDED: 50장 초과")
    @PostMapping("/device")
    public DataResponse<PhotoClassificationResponse> applyDevice(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user,
            @PathVariable UUID tripId,@Valid @RequestBody DevicePhotoClassificationRequest body) {
        return DataResponse.of(service.applyDevice(CurrentUser.requireUserId(user),tripId,body));
    }
}
