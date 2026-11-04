package com.eodilog.visit.controller;

import com.eodilog.global.common.error.ErrorResponse;
import com.eodilog.global.common.response.DataResponse;
import com.eodilog.global.common.response.PageResponse;
import com.eodilog.global.security.AuthUser;
import com.eodilog.trip.controller.CurrentUser;
import com.eodilog.visit.dto.CreateVisitRequest;
import com.eodilog.visit.dto.VisitResponse;
import com.eodilog.visit.dto.VisitReviewStatus;
import com.eodilog.visit.service.VisitService;
import com.eodilog.visit.service.VisitService.CreateResult;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
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
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "방문", description = "실제 방문 기록('다녀옴' 직접 체크)과 조회·체크 해제")
@RestController
@RequestMapping("/api/v1/trips/{tripId}/visits")
@RequiredArgsConstructor
public class VisitController {

	private final VisitService visitService;

	@Operation(summary = "다녀옴 체크", description = """
			여행의 ACTIVE 멤버가 자기 방문을 기록한다. 방문자는 요청한 사람으로 서버가 정한다. 자동 위치 수집은 하지 않는다.
			placeId는 존재하는 장소면 코스에 없어도 되고, visitedAt은 지금보다 미래일 수 없다(5분 여유). evidenceType은 MANUAL만 받는다.
			여행·멤버·장소당 방문은 하나다. 이미 체크한 장소를 다시 보내면 새로 만들지 않고 기존 방문을 200으로 돌려준다(visitedAt도 그대로).
			그래서 Idempotency-Key는 필요 없다. 체크를 해제(DELETE)한 뒤 다시 체크하면 새 방문이 생긴다.""")
	@ApiResponse(responseCode = "201", description = "방문 기록 생성")
	@ApiResponse(responseCode = "200", description = "이미 체크한 장소: 기존 방문 반환")
	@ApiResponse(responseCode = "404", description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@PostMapping
	public ResponseEntity<DataResponse<VisitResponse>> createVisit(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId,
			@RequestBody CreateVisitRequest request) {
		CreateResult result = visitService.createVisit(CurrentUser.requireUserId(authUser), tripId, request);
		return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK)
				.body(DataResponse.of(result.visit()));
	}

	@Operation(summary = "방문 목록", description = """
			여행의 ACTIVE 멤버만 조회한다. memberId를 생략하면 내 방문, 보내면 같은 여행 동행(나간 동행 포함)의 방문이다.
			placeId로 한 장소만 볼 수 있다. 최근 등록 순(createdAt DESC, id DESC)이며 체크를 해제한 방문은 뺀다.
			reviewStatus는 평가 기능 전이라 WRITTEN이면 빈 목록, UNWRITTEN은 ALL과 같다. reviewId·reviewScore는 항상 null이다.""")
	@ApiResponse(responseCode = "200", description = "조회 성공")
	@ApiResponse(responseCode = "404", description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@GetMapping
	public ResponseEntity<PageResponse<VisitResponse>> getVisits(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId,
			@Parameter(description = "볼 동행의 멤버십 ID. 생략하면 나", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e80")
			@RequestParam(required = false) UUID memberId,
			@Parameter(description = "이 장소의 방문만", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6ea0")
			@RequestParam(required = false) UUID placeId,
			@Parameter(description = "평가 작성 여부 필터", example = "ALL")
			@RequestParam(defaultValue = "ALL") VisitReviewStatus reviewStatus,
			@Parameter(description = "이전 응답의 page.nextCursor. 첫 페이지는 생략")
			@RequestParam(required = false) String cursor,
			@Parameter(description = "페이지 크기(1~100)", example = "20")
			@RequestParam(defaultValue = "" + VisitService.DEFAULT_LIMIT)
			@Min(1) @Max(VisitService.MAX_LIMIT) int limit) {
		return ResponseEntity.ok(visitService.getVisits(CurrentUser.requireUserId(authUser), tripId, memberId, placeId,
				reviewStatus, cursor, limit));
	}

	@Operation(summary = "다녀옴 체크 해제", description = """
			방문을 기록한 본인이 ACTIVE 멤버일 때만 지운다. 방장이라도 다른 사람의 방문은 지울 수 없다(403).
			지운 방문은 목록에서 빠지고 되살리지 않는다. 다시 체크하면 새 방문이 생긴다.""")
	@ApiResponse(responseCode = "204", description = "체크 해제 성공")
	@ApiResponse(responseCode = "403", description = "FORBIDDEN: 내 방문이 아님",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "404",
			description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행 / VISIT_NOT_FOUND: 없거나 이미 해제한 방문",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@DeleteMapping("/{visitId}")
	public ResponseEntity<Void> deleteVisit(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId,
			@Parameter(description = "방문 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6eb0")
			@PathVariable UUID visitId) {
		visitService.deleteVisit(CurrentUser.requireUserId(authUser), tripId, visitId);
		return ResponseEntity.noContent().build();
	}

}
