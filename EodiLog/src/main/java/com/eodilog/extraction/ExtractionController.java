package com.eodilog.extraction;

import com.eodilog.global.common.error.ErrorResponse;
import com.eodilog.global.common.response.DataResponse;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.global.security.AuthUser;
import com.eodilog.job.JobRef;
import com.eodilog.trip.controller.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "장소 추출", description = "링크·캡처에서 AI로 장소 후보 찾기(PLACE_EXTRACTION). 후보는 저장·방문이 아니다")
@RestController
@RequestMapping("/api/v1/extractions")
@RequiredArgsConstructor
public class ExtractionController {

	private final ExtractionService extractionService;

	@Operation(summary = "장소 추출 요청", description = """
			본인. 링크(url)나 캡처(captureAssetIds) 중 하나 이상으로 AI 장소 추출 작업을 등록한다. Idempotency-Key가 필수이며,
			같은 키·같은 본문이면 처음 접수한 작업을 그대로 반환한다.
			캡처는 POST /assets/upload-intents(purpose=CAPTURE) → 업로드 → complete까지 끝낸 내 JPG/PNG만, 최대 10장이다.
			url은 http(s) 공개 주소(계정 정보 없음, 포트는 생략·80·443) 2048자 이하, memo는 500자 이하다.
			진행·결과는 GET /api/v1/extractions/{jobId}로 조회한다. 장소 추출 설정을 끄면 진행 중인 작업은 CANCELLED가 된다.""")
	@ApiResponse(responseCode = "202", description = "접수. data는 PLACE_EXTRACTION 작업 참조(JobRef)")
	@ApiResponse(responseCode = "400", description = """
			VALIDATION_ERROR: 키 없음, url·captureAssetIds 둘 다 없음, 지원하지 않는 url, 500자 넘는 memo,
			중복 캡처, 내 READY CAPTURE가 아닌 파일(남의 파일·없는 파일 포함)""",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409", description = """
			AI_FEATURE_DISABLED: 내 장소 추출 설정이 OFF / IDEMPOTENCY_KEY_REUSED·REQUEST_IN_PROGRESS: 요청 키 충돌""",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "422", description = "INPUT_LIMIT_EXCEEDED: 캡처 11장 이상",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@PostMapping
	public ResponseEntity<DataResponse<JobRef>> requestExtraction(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "요청 중복 방지 키(1~100자)", required = true)
			@RequestHeader(name = IdempotencyService.HEADER_NAME, required = false) String idempotencyKey,
			@RequestBody ExtractionRequest request) {
		JobRef job = extractionService.request(CurrentUser.requireUserId(authUser), idempotencyKey, request);
		return ResponseEntity.status(HttpStatus.ACCEPTED).body(DataResponse.of(job));
	}

	@Operation(summary = "장소 추출 진행·결과 조회", description = """
			작업 소유자 본인. job.status가 QUEUED·RUNNING이면 진행 중이고 resultStatus=null, candidates=[]다.
			FAILED·CANCELLED면 사유가 job.error에 있다. SUCCEEDED면 resultStatus와 후보를 준다.
			후보의 place.id는 로컬 장소 ID라 PUT /me/bookmarks/{placeId}, PUT /trips/{tripId}/saved-places/{placeId}/me로 바로 저장한다.
			place가 null인 후보는 GET /places로 찾거나 POST /places로 수동 장소를 만든 뒤 저장한다.""")
	@ApiResponse(responseCode = "200", description = "조회 성공")
	@ApiResponse(responseCode = "404", description = "JOB_NOT_FOUND: 없거나 남의·지운 작업, 장소 추출이 아닌 작업",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@GetMapping("/{jobId}")
	public ResponseEntity<DataResponse<ExtractionResult>> getExtraction(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "작업 ID(UUID)", example = "019a0000-0000-7000-8000-000000000001")
			@PathVariable UUID jobId) {
		return ResponseEntity.ok(DataResponse.of(extractionService.get(CurrentUser.requireUserId(authUser), jobId)));
	}

	@Operation(summary = "장소 추출 취소·삭제", description = """
			작업 소유자 본인. 진행 중이면 취소하고, 입력(링크·메모·캡처)과 후보를 지운다. 뒤늦게 도착한 AI 결과도 저장하지 않는다.
			다른 추출 작업에 쓰지 않은 캡처 파일은 삭제된다. 이미 저장한 장소·북마크는 그대로 둔다. 다시 보내면 404다.""")
	@ApiResponse(responseCode = "204", description = "삭제 성공")
	@ApiResponse(responseCode = "404", description = "JOB_NOT_FOUND: 없거나 남의·이미 지운 작업, 장소 추출이 아닌 작업",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@DeleteMapping("/{jobId}")
	public ResponseEntity<Void> deleteExtraction(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "작업 ID(UUID)", example = "019a0000-0000-7000-8000-000000000001")
			@PathVariable UUID jobId) {
		extractionService.delete(CurrentUser.requireUserId(authUser), jobId);
		return ResponseEntity.noContent().build();
	}

}
