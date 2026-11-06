package com.eodilog.asset.controller;

import com.eodilog.asset.service.AssetService;
import com.eodilog.asset.dto.*;
import com.eodilog.global.common.response.DataResponse;
import com.eodilog.global.security.AuthUser;
import com.eodilog.trip.controller.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.core.io.InputStreamResource;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@Tag(name = "파일", description = "비공개 캡처·프로필·여행 사진 업로드와 인증 다운로드")
@RestController @RequestMapping("/api/v1/assets") @RequiredArgsConstructor
public class AssetController {
    private final AssetService service;

    @Operation(summary = "파일 업로드 요청", description = "로그인 사용자. PROFILE/CAPTURE는 JPG/PNG, TRIP_PHOTO는 ACTIVE 여행 멤버의 JPG/PNG/HEIC(HEIF). 기본 최대 15MiB, PUT URL 10분. 배치 없는 여행 업로드도 호환하며 사진 등록은 배치가 필요하다.")
    @ApiResponse(responseCode = "201", description = "PENDING 파일 및 PUT URL 생성")
    @PostMapping("/upload-intents")
    public ResponseEntity<DataResponse<UploadIntentResponse>> create(@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user,
            @Valid @RequestBody UploadIntentRequest request) {
        return ResponseEntity.status(201).body(DataResponse.of(service.create(CurrentUser.requireUserId(user), request)));
    }

    @Operation(summary = "파일 업로드 완료", description = "업로더 본인만. 여행 사진은 현재 ACTIVE 멤버. 미완료 파일 만료(기본 24시간) 전에 실제 객체 크기·전체 디코딩 검사와 메타데이터 제거 후 READY가 된다. READY 재요청은 같은 결과다.")
    @ApiResponse(responseCode = "200", description = "READY 파일")
    @ApiResponse(responseCode = "409", description = "ASSET_NOT_PENDING: 취소·삭제 상태 / UPLOAD_NOT_FOUND: 미업로드 객체")
    @ApiResponse(responseCode = "410", description = "UPLOAD_EXPIRED")
    @ApiResponse(responseCode = "422", description = "UPLOAD_MISMATCH: 크기 불일치·디코딩 실패")
    @PostMapping("/{assetId}/complete")
    public DataResponse<AssetResponse> complete(@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user, @PathVariable UUID assetId) {
        return DataResponse.of(service.complete(CurrentUser.requireUserId(user), assetId));
    }

    @Operation(summary = "업로드 취소", description = "업로더 본인의 PENDING만 취소한다. 여행 사진은 ACTIVE 멤버여야 한다. 객체 정리 후 CANCELLED로 전환해 이후 완료를 차단한다.")
    @ApiResponse(responseCode = "204", description = "취소 완료")
    @ApiResponse(responseCode = "409", description = "ASSET_NOT_PENDING: PENDING이 아닌 파일")
    @DeleteMapping("/{assetId}")
    public ResponseEntity<Void> cancel(@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user, @PathVariable UUID assetId) {
        service.cancel(CurrentUser.requireUserId(user), assetId);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "파일 다운로드", description = "READY PROFILE은 로그인 사용자, CAPTURE는 소유자, 여행 사진은 현재 ACTIVE 멤버만. 배치 업로드는 등록된 사진만 제공하며 기존 배치 없는 파일도 호환한다. 위치·촬영시각 메타데이터가 없는 표시 이미지를 private, no-store로 제공하고 HEIC는 JPEG다. 피드 경유는 후속 기능이다.")
    @ApiResponse(responseCode = "200", description = "인증된 이미지 바이트")
    @ApiResponse(responseCode = "409", description = "ASSET_NOT_READY")
    @GetMapping(value = "/{assetId}/download", produces = {"image/jpeg", "image/png"})
    public ResponseEntity<InputStreamResource> download(@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user,
            @PathVariable UUID assetId, @RequestParam(required = false) UUID feedId) {
        var download = service.download(CurrentUser.requireUserId(user), assetId, feedId);
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "private, no-store")
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"photo\"")
                .header("X-Content-Type-Options", "nosniff")
                .contentType(MediaType.parseMediaType(download.contentType())).contentLength(download.byteSize())
                .body(new InputStreamResource(download.body()));
    }
}
