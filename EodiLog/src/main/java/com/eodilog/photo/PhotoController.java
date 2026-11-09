package com.eodilog.photo;

import com.eodilog.global.common.response.DataResponse;
import com.eodilog.global.common.response.PageResponse;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.global.security.AuthUser;
import com.eodilog.photo.dto.*;
import com.eodilog.trip.controller.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@Tag(name = "사진", description = "여행 사진 배치·등록·목록")
@RestController @RequestMapping("/api/v1/trips/{tripId}") @RequiredArgsConstructor
public class PhotoController {
    private final PhotoService service;

    @Operation(summary = "사진 업로드 배치 생성", description = "ACTIVE 여행 멤버. Idempotency-Key 필수, fileCount 1~50. 기본 유효기간 24시간. 재요청도 현재 멤버 권한을 검사한다.")
    @ApiResponse(responseCode = "201", description = "배치 생성")
    @ApiResponse(responseCode = "409", description = "IDEMPOTENCY_KEY_REUSED / REQUEST_IN_PROGRESS")
    @ApiResponse(responseCode = "422", description = "INPUT_LIMIT_EXCEEDED: 50장 초과")
    @PostMapping("/photo-upload-batches")
    public ResponseEntity<DataResponse<PhotoBatchResponse>> batch(@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user,
            @PathVariable UUID tripId, @RequestHeader(name = IdempotencyService.HEADER_NAME, required = false) String key,
            @Valid @RequestBody CreatePhotoBatchRequest request) {
        return ResponseEntity.status(201).body(DataResponse.of(service.createBatch(CurrentUser.requireUserId(user), tripId, key, request)));
    }

    @Operation(summary = "여행 사진 등록", description = "ACTIVE 멤버 본인 소유의 READY·TRIP_PHOTO이며 같은 여행·배치 파일만 등록한다. 배치 상한과 asset 유일성을 원자적으로 검사한다. 같은 등록 재시도는 기존 사진을 반환한다.")
    @ApiResponse(responseCode = "201", description = "사진 등록 또는 동일 등록 재요청")
    @ApiResponse(responseCode = "409", description = "PHOTO_BATCH_FULL / ASSET_NOT_READY / ASSET_ALREADY_REGISTERED")
    @ApiResponse(responseCode = "410", description = "PHOTO_BATCH_EXPIRED")
    @PostMapping("/photos")
    public ResponseEntity<DataResponse<PhotoResponse>> register(@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user,
            @PathVariable UUID tripId, @Valid @RequestBody CreatePhotoRequest request) {
        return ResponseEntity.status(201).body(DataResponse.of(service.register(CurrentUser.requireUserId(user), tripId, request)));
    }

    @Operation(summary = "여행 사진 목록", description = "ACTIVE 여행 멤버. createdAt DESC, id DESC 커서 목록. 일부 파일의 업로드 실패는 이미 등록된 사진에 영향을 주지 않는다. 분류·그룹은 후속 기능이므로 지정 필터에 결과가 없다.")
    @ApiResponse(responseCode = "200", description = "사진 목록")
    @GetMapping("/photos")
    public PageResponse<PhotoResponse> list(@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user,
            @PathVariable UUID tripId, @RequestParam(required = false) String topic,
            @RequestParam(required = false) UUID groupId, @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int limit) {
        return service.list(CurrentUser.requireUserId(user), tripId, topic, groupId, cursor, limit);
    }
}
