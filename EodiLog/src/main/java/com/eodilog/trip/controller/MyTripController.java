package com.eodilog.trip.controller;

import com.eodilog.global.common.response.PageResponse;
import com.eodilog.global.security.AuthUser;
import com.eodilog.trip.domain.TripStatus;
import com.eodilog.trip.dto.TripResponse;
import com.eodilog.trip.service.TripQueryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "여행", description = "여행 생성·조회·수정")
@RestController
@RequestMapping("/api/v1/me/trips")
@RequiredArgsConstructor
public class MyTripController {

	private final TripQueryService tripQueryService;

	@Operation(summary = "내 여행 목록", description = """
			내가 ACTIVE 멤버인 여행을 최근 만든 순(createdAt DESC, id DESC)으로 조회한다. 나간 여행·삭제된 여행은 제외한다.
			status는 조회 시점의 날짜(Asia/Seoul)와 기간으로 거른다: 기간 없음·시작 전 PLANNING, 시작일~종료일 ONGOING, 종료 후 COMPLETED.
			다음 페이지는 응답의 page.nextCursor를 cursor로 보낸다.""")
	@ApiResponse(responseCode = "200", description = "조회 성공")
	@GetMapping
	public ResponseEntity<PageResponse<TripResponse>> getMyTrips(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 상태 필터. 생략하면 전체", example = "PLANNING")
			@RequestParam(required = false) TripStatus status,
			@Parameter(description = "이전 응답의 page.nextCursor. 첫 페이지는 생략")
			@RequestParam(required = false) String cursor,
			@Parameter(description = "페이지 크기(1~100)", example = "20")
			@RequestParam(defaultValue = "" + TripQueryService.DEFAULT_LIMIT)
			@Min(1) @Max(TripQueryService.MAX_LIMIT) int limit) {
		return ResponseEntity.ok(
				tripQueryService.getMyTrips(CurrentUser.requireUserId(authUser), status, cursor, limit));
	}

}
