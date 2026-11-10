package com.eodilog.visit.candidate;

import com.eodilog.global.common.response.DataResponse;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.global.security.AuthUser;
import com.eodilog.job.JobRef;
import com.eodilog.trip.controller.CurrentUser;
import com.eodilog.visit.dto.VisitResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "방문", description = "실제 방문 기록('다녀옴' 직접 체크)과 조회·체크 해제, 사진 방문 후보 감지·확정")
@RestController
@RequestMapping("/api/v1/trips/{tripId}")
@RequiredArgsConstructor
public class VisitCandidateController {

	private final VisitCandidateService service;

	@Operation(summary = "사진으로 방문 후보 감지", description = """
			ACTIVE 멤버가 이 여행에 직접 올린 사진(삭제 안 됨·READY) 1~50장으로 본인 방문 후보만 제안한다. Idempotency-Key 필수.
			실제 방문(체크)은 만들지 않으며 사진 속 다른 사람을 방문자로 정하지 않는다. 남이 올린·다른 여행·지운 사진은 404 PHOTO_NOT_FOUND.
			판정은 AI 서버(AI spec §8.2)가 비공개 EXIF 위치·촬영 시각과 지금 코스로 한다(같은 날 코스 장소 300m 안 우선, 없으면 날짜 무관).
			시각은 사진의 capturedAt, 없으면 EXIF 촬영 시각(한국 시각). 위치나 시각이 없는 사진은 보내지 않는다. 이미 체크한 장소는 제안하지 않는다.
			여행 기간이 없으면 422 INSUFFICIENT_DATA(trip.startDate).
			결과는 GET /jobs/{jobId}(요청자만)의 {candidates:VisitCandidate[]}이다. 방문 감지 설정 OFF면 409.""")
	@ApiResponse(responseCode = "202", description = "VISIT_DETECTION 작업 접수")
	@ApiResponse(responseCode = "409", description = "AI_FEATURE_DISABLED: 방문 감지 설정 OFF / IDEMPOTENCY_KEY_REUSED")
	@ApiResponse(responseCode = "422", description = "INPUT_LIMIT_EXCEEDED: 50장 초과 / INSUFFICIENT_DATA: 여행 기간 없음")
	@PostMapping("/visit-detections")
	public ResponseEntity<DataResponse<JobRef>> detect(@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user,
			@Parameter(description = "여행 ID(UUID)") @PathVariable UUID tripId,
			@RequestHeader(name = IdempotencyService.HEADER_NAME, required = false) String key,
			@Valid @RequestBody VisitDetectionRequest body) {
		return ResponseEntity.accepted().body(DataResponse.of(service.request(CurrentUser.requireUserId(user), tripId, key, body)));
	}

	@Operation(summary = "방문 후보 확정", description = """
			후보 본인(ACTIVE 멤버)만 확정한다. 남의 후보·다른 여행의 후보는 404 VISIT_CANDIDATE_NOT_FOUND.
			확정하면 evidenceType=PHOTO 방문이 생긴다. 이미 직접 체크한 같은 장소면 그 방문에 연결해 돌려준다.
			같은 후보를 다시 확정하면 처음 방문을 그대로 201로 돌려준다(expectedVersion·설정 검사 없음). 미확정 후보는 방문 감지 설정 OFF면 409.
			근거 사진이 이동·삭제됐거나 같은 장소의 다른 후보가 먼저 확정되면 409 VISIT_CANDIDATE_INVALIDATED.""")
	@ApiResponse(responseCode = "201", description = "확정한 방문(중복 확정이면 기존 방문)")
	@ApiResponse(responseCode = "404", description = "TRIP_NOT_FOUND / VISIT_CANDIDATE_NOT_FOUND")
	@ApiResponse(responseCode = "409", description = "VERSION_CONFLICT / VISIT_CANDIDATE_INVALIDATED / AI_FEATURE_DISABLED")
	@PostMapping("/visit-candidates/{candidateId}/confirm")
	public ResponseEntity<DataResponse<VisitResponse>> confirm(@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user,
			@Parameter(description = "여행 ID(UUID)") @PathVariable UUID tripId,
			@Parameter(description = "방문 후보 ID(UUID)") @PathVariable UUID candidateId,
			@RequestBody ConfirmVisitCandidateRequest body) {
		return ResponseEntity.status(HttpStatus.CREATED)
				.body(DataResponse.of(service.confirm(CurrentUser.requireUserId(user), tripId, candidateId, body)));
	}

}
