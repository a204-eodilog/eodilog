package com.eodilog.photo;

import com.eodilog.global.common.response.DataResponse;
import com.eodilog.global.common.response.PageResponse;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.global.security.AuthUser;
import com.eodilog.photo.dto.*;
import com.eodilog.job.JobRef;
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

@Tag(name = "사진", description = "여행 사진 배치·등록·목록·수동 관리")
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

    @Operation(summary = "여행 사진 목록", description = "ACTIVE 여행 멤버. createdAt DESC, id DESC 커서 목록. topic은 LANDSCAPE/FOOD/PEOPLE/OTHER만 허용. 삭제 사진 제외. groupId로 해당 여행의 유사 사진 그룹을 필터링한다.")
    @ApiResponse(responseCode = "200", description = "사진 목록")
    @GetMapping("/photos")
    public PageResponse<PhotoResponse> list(@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user,
            @PathVariable UUID tripId, @RequestParam(required = false) String topic,
            @RequestParam(required = false) UUID groupId, @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int limit) {
        return service.list(CurrentUser.requireUserId(user), tripId, topic, groupId, cursor, limit);
    }

    @Operation(summary = "사진 수동 보정", description = "현재 ACTIVE 멤버인 업로더만 수정. 생략은 유지, placeId null은 해제, topics []는 해제하고 null은 거부한다. 수동 보정 표시를 보존하고 성공 시 version 증가. groupId 변경은 400.")
    @ApiResponse(responseCode = "200", description = "수정한 사진")
    @ApiResponse(responseCode = "400", description = "VALIDATION_ERROR: 양의 JSON 정수 expectedVersion 필수, 빈 수정·미지원 groupId·없는 장소·null/중복/미지원/4개 초과 주제 거부")
    @ApiResponse(responseCode = "404", description = "PHOTO_NOT_FOUND / TRIP_NOT_FOUND")
    @ApiResponse(responseCode = "409", description = "VERSION_CONFLICT")
    @PatchMapping("/photos/{photoId}")
    public DataResponse<PhotoResponse> update(@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user,
            @PathVariable UUID tripId, @PathVariable UUID photoId, @RequestBody UpdatePhotoRequest request) {
        return DataResponse.of(service.update(CurrentUser.requireUserId(user), tripId, photoId, request));
    }

    @Operation(summary = "사진 삭제 요청", description = "현재 ACTIVE 멤버인 업로더만 삭제. 커밋 즉시 사진 및 새 다운로드를 차단하고 고정된 원본/표시 파일을 비동기 정리한다. 이미 열린 스트림은 회수하지 않는다. 삭제 완료 후에도 같은 작업을 반환한다. 승인된 정리는 이탈·여행 삭제 후에도 계속된다.")
    @ApiResponse(responseCode = "202", description = "삭제 작업 접수 또는 기존 작업")
    @ApiResponse(responseCode = "404", description = "PHOTO_NOT_FOUND / TRIP_NOT_FOUND")
    @DeleteMapping("/photos/{photoId}")
    public ResponseEntity<DataResponse<JobRef>> delete(@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user,
            @PathVariable UUID tripId, @PathVariable UUID photoId) {
        return ResponseEntity.accepted().body(DataResponse.of(service.delete(CurrentUser.requireUserId(user), tripId, photoId)));
    }

    @Operation(summary = "사진 일괄 변경", description = "현재 ACTIVE 멤버인 업로더 본인 사진만(D-16). action 하나(UPDATE 수정·MOVE 여행 이동·UNGROUP 묶음 해제·DELETE 삭제)를 사진 1~50장에 한 트랜잭션으로 적용한다. "
            + "사진마다 expectedVersion 필수, 중복 ID 금지, 해당 action의 필드만 허용(UPDATE는 placeId/topics 하나 이상, MOVE는 targetTripId 필수). "
            + "검증 실패 시 아무것도 바꾸지 않는다. UPDATE는 단건 수동 보정과 같은 규칙, DELETE는 단건 삭제와 같이 사진마다 PHOTO_DELETE 정리 작업을 등록한다. "
            + "MOVE는 양쪽 여행의 ACTIVE 멤버만 가능하며 이동한 사진의 AI 묶음은 해제되고 원래 여행 피드에서 빠진다.")
    @ApiResponse(responseCode = "200", description = "변경한 사진 또는 삭제 승인한 사진 ID")
    @ApiResponse(responseCode = "400", description = "VALIDATION_ERROR: action·photos·expectedVersion 누락, 중복 ID, 다른 action 필드, 빈 수정, 잘못된 주제·없는 장소, 같은 여행으로 이동")
    @ApiResponse(responseCode = "404", description = "PHOTO_NOT_FOUND(없음·타인·삭제·다른 여행 사진) / TRIP_NOT_FOUND(여행 또는 이동 대상 여행 접근 불가)")
    @ApiResponse(responseCode = "409", description = "VERSION_CONFLICT: 한 장이라도 버전이 다름")
    @ApiResponse(responseCode = "422", description = "INPUT_LIMIT_EXCEEDED: 51장 이상")
    @PostMapping("/photos/batch")
    public DataResponse<PhotoBatchWriteResponse> batchWrite(@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user,
            @PathVariable UUID tripId, @RequestBody PhotoBatchWriteRequest request) {
        return DataResponse.of(service.batchWrite(CurrentUser.requireUserId(user), tripId, request));
    }

    @Operation(summary = "사진 전체 요약", description = "ACTIVE 여행 멤버. 목록 필터와 독립적으로 삭제되지 않은 전체 사진을 집계한다. 주제별 수의 합은 전체 수와 다를 수 있다. 그룹은 삭제되지 않은 사진 수를 집계하며 빈 그룹은 제외한다.")
    @ApiResponse(responseCode = "200", description = "여행 사진 요약")
    @GetMapping("/photo-summary")
    public DataResponse<PhotoSummaryResponse> summary(@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user,
            @PathVariable UUID tripId) {
        return DataResponse.of(service.summary(CurrentUser.requireUserId(user), tripId));
    }
}
