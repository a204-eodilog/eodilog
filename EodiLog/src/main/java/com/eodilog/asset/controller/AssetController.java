package com.eodilog.asset.controller;

import com.eodilog.asset.dto.AssetResponse;
import com.eodilog.asset.dto.UploadIntentRequest;
import com.eodilog.asset.dto.UploadIntentResponse;
import com.eodilog.asset.service.AssetService;
import com.eodilog.asset.service.AssetService.Download;
import com.eodilog.global.common.error.ErrorResponse;
import com.eodilog.global.common.response.DataResponse;
import com.eodilog.global.security.AuthUser;
import com.eodilog.trip.controller.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "파일", description = "사진·캡처·프로필 파일 업로드와 다운로드. 파일은 서명 URL로 저장소에 직접 올린다")
@RestController
@RequestMapping("/api/v1/assets")
@RequiredArgsConstructor
public class AssetController {

	private final AssetService assetService;

	@Operation(summary = "업로드 요청", description = """
			로그인 사용자. TRIP_PHOTO는 그 여행의 ACTIVE 멤버만 요청한다.
			PROFILE·CAPTURE는 JPG/PNG, TRIP_PHOTO는 JPG/PNG/HEIC. 파일 1개 최대 15MB.
			응답의 uploadUrl에 method·headers 그대로 파일 바이트를 보낸다(Authorization 헤더는 붙이지 않는다).
			올린 뒤 POST /assets/{assetId}/complete를 불러야 쓸 수 있는 파일(READY)이 된다.
			batchId(사진 묶음)는 아직 지원하지 않아 보내면 400이다.""")
	@ApiResponse(responseCode = "201", description = "업로드 URL 발급")
	@ApiResponse(responseCode = "404", description = "TRIP_NOT_FOUND: TRIP_PHOTO의 여행이 없거나 멤버가 아님",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@PostMapping("/upload-intents")
	public ResponseEntity<DataResponse<UploadIntentResponse>> createUploadIntent(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@RequestBody UploadIntentRequest request) {
		return ResponseEntity.status(HttpStatus.CREATED)
				.body(DataResponse.of(assetService.createUploadIntent(CurrentUser.requireUserId(authUser), request)));
	}

	@Operation(summary = "업로드 완료 확인", description = """
			업로더 본인만. 저장소에 파일이 있는지, 크기와 실제 형식(파일 앞부분 시그니처)이 요청과 같은지 확인하고 READY로 바꾼다.
			이미 READY인 파일은 그대로 200이라 재시도해도 된다.
			크기·형식이 다르면 올린 파일을 지우고 422다. 업로드 URL이 아직 유효하면 같은 URL로 다시 올린 뒤 다시 부른다.""")
	@ApiResponse(responseCode = "200", description = "확인 완료(READY)")
	@ApiResponse(responseCode = "404", description = "ASSET_NOT_FOUND: 없거나 내 파일이 아님",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409", description = """
			ASSET_NOT_PENDING: 취소한 파일 / UPLOAD_NOT_FOUND: 저장소에 아직 파일이 없음""",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "422", description = "UPLOAD_MISMATCH: 올린 파일의 크기·형식이 요청과 다름",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@PostMapping("/{assetId}/complete")
	public ResponseEntity<DataResponse<AssetResponse>> complete(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "파일 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6ed0")
			@PathVariable UUID assetId) {
		return ResponseEntity.ok(DataResponse.of(assetService.complete(CurrentUser.requireUserId(authUser), assetId)));
	}

	@Operation(summary = "업로드 취소", description = """
			업로더 본인만. 아직 확인 전(PENDING)인 업로드만 취소하고 저장소의 파일도 지운다. 이후 complete는 409다.
			이미 취소한 파일은 다시 204. 확인을 마친 파일(READY)은 409이며 사진은 사진 삭제 API로 지운다.""")
	@ApiResponse(responseCode = "204", description = "취소 완료")
	@ApiResponse(responseCode = "404", description = "ASSET_NOT_FOUND: 없거나 내 파일이 아님",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409", description = "ASSET_NOT_PENDING: 이미 확인을 마친 파일",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@DeleteMapping("/{assetId}")
	public ResponseEntity<Void> cancel(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "파일 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6ed0")
			@PathVariable UUID assetId) {
		assetService.cancel(CurrentUser.requireUserId(authUser), assetId);
		return ResponseEntity.noContent().build();
	}

	@Operation(summary = "파일 받기", description = """
			READY 파일의 바이트를 서버가 저장소에서 받아 그대로 보낸다. 저장소 주소는 공개하지 않는다.
			업로더는 항상, PROFILE은 로그인 사용자 누구나, CAPTURE는 업로더만, TRIP_PHOTO는 그 여행의 ACTIVE 멤버만 받는다.
			볼 수 없는 파일은 없는 파일과 같은 404다. 응답은 Cache-Control: private, no-store.
			공동 피드 경유 조회(feedId)는 피드 기능과 함께 추가한다.""")
	@ApiResponse(responseCode = "200", description = "파일 바이트", content = {
			@Content(mediaType = "image/jpeg", schema = @Schema(type = "string", format = "binary")),
			@Content(mediaType = "image/png", schema = @Schema(type = "string", format = "binary")),
			@Content(mediaType = "image/heic", schema = @Schema(type = "string", format = "binary"))})
	@ApiResponse(responseCode = "404", description = "ASSET_NOT_FOUND: 없거나 볼 수 없거나 아직 확인 전인 파일",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@GetMapping("/{assetId}/download")
	public ResponseEntity<InputStreamResource> download(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "파일 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6ed0")
			@PathVariable UUID assetId) {
		Download download = assetService.download(CurrentUser.requireUserId(authUser), assetId);
		return ResponseEntity.ok()
				.contentType(MediaType.parseMediaType(download.asset().getContentType()))
				.contentLength(download.asset().getByteSize())
				.cacheControl(CacheControl.noStore().cachePrivate())
				.header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline().build().toString())
				.header("X-Content-Type-Options", "nosniff")
				.body(new InputStreamResource(download.body()));
	}

}
