package com.eodilog.visit.controller;

import com.eodilog.global.common.error.ErrorResponse;
import com.eodilog.global.common.response.DataResponse;
import com.eodilog.global.common.response.PageResponse;
import com.eodilog.global.security.AuthUser;
import com.eodilog.trip.controller.CurrentUser;
import com.eodilog.visit.dto.ReviewResponse;
import com.eodilog.visit.dto.ReviewWriteRequest;
import com.eodilog.visit.service.ReviewService;
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
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

// 경로가 /visits/{visitId}/review와 /reviews 두 갈래라 VisitController와 나눴다
@Tag(name = "평가", description = "실제 방문에 남기는 별점·후기 작성·수정·삭제와 여행 평가 목록")
@RestController
@RequestMapping("/api/v1/trips/{tripId}")
@RequiredArgsConstructor
public class ReviewController {

	private final ReviewService reviewService;

	@Operation(summary = "방문 평가 쓰기·고치기", description = """
			방문을 기록한 본인(ACTIVE 멤버)만 쓴다. 방문 하나에 평가 하나이며, 처음이면 만들고 이미 있으면 고친다(모두 200).
			score는 1~5 정수만(반 점·문자열 400), body는 공백만이 아닌 1,000자 이하다.
			expectedVersion은 선택이다. 보내면 다를 때 409 VERSION_CONFLICT, 생략하면 덮어쓴다. 아직 평가가 없는데 보내면 400.
			점수·본문이 그대로면 version이 오르지 않는다. 체크를 해제한 방문·다른 여행의 방문은 404 VISIT_NOT_FOUND.""")
	@ApiResponse(responseCode = "200", description = "작성·수정 성공")
	@ApiResponse(responseCode = "403", description = "FORBIDDEN: 내 방문이 아님",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "404",
			description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행 / VISIT_NOT_FOUND: 없거나 해제한 방문",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409", description = "VERSION_CONFLICT: 조회한 뒤 평가가 바뀜",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@PutMapping("/visits/{visitId}/review")
	public ResponseEntity<DataResponse<ReviewResponse>> writeReview(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId,
			@Parameter(description = "방문 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6eb0")
			@PathVariable UUID visitId,
			@RequestBody ReviewWriteRequest request) {
		return ResponseEntity.ok(DataResponse.of(
				reviewService.writeReview(CurrentUser.requireUserId(authUser), tripId, visitId, request)));
	}

	@Operation(summary = "방문 평가 삭제", description = """
			평가를 쓴 본인(ACTIVE 멤버)만 지운다. 방장이라도 다른 사람의 평가는 지울 수 없다(403).
			지운 평가는 되살리지 않고, 다시 쓰면 새 평가(version 1)가 생긴다. 평가를 지워야 방문 체크를 해제할 수 있다.""")
	@ApiResponse(responseCode = "204", description = "삭제 성공")
	@ApiResponse(responseCode = "403", description = "FORBIDDEN: 내 평가가 아님",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "404",
			description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행 / VISIT_NOT_FOUND: 없거나 해제한 방문 / REVIEW_NOT_FOUND: 평가가 없음",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@DeleteMapping("/visits/{visitId}/review")
	public ResponseEntity<Void> deleteReview(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId,
			@Parameter(description = "방문 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6eb0")
			@PathVariable UUID visitId) {
		reviewService.deleteReview(CurrentUser.requireUserId(authUser), tripId, visitId);
		return ResponseEntity.noContent().build();
	}

	@Operation(summary = "여행 평가 목록", description = """
			여행의 ACTIVE 멤버만 조회한다. memberId를 생략하면 여행 전체(동행 평가 포함), 보내면 같은 여행 동행(나간 동행 포함) 한 명의 평가다.
			다른 여행·없는 memberId는 400. 최근 작성 순(createdAt DESC, id DESC)이고 항목마다 방문(장소 ID·방문 시각)과 장소(이름·주소) 요약을 담는다.""")
	@ApiResponse(responseCode = "200", description = "조회 성공")
	@ApiResponse(responseCode = "404", description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@GetMapping("/reviews")
	public ResponseEntity<PageResponse<ReviewResponse>> getReviews(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId,
			@Parameter(description = "이 동행의 평가만. 멤버십 ID, 생략하면 여행 전체", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e80")
			@RequestParam(required = false) UUID memberId,
			@Parameter(description = "이전 응답의 page.nextCursor. 첫 페이지는 생략")
			@RequestParam(required = false) String cursor,
			@Parameter(description = "페이지 크기(1~100)", example = "20")
			@RequestParam(defaultValue = "" + ReviewService.DEFAULT_LIMIT)
			@Min(1) @Max(ReviewService.MAX_LIMIT) int limit) {
		return ResponseEntity.ok(reviewService.getReviews(CurrentUser.requireUserId(authUser), tripId, memberId, cursor,
				limit));
	}

}
