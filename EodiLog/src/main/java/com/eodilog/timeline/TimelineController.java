package com.eodilog.timeline;

import com.eodilog.global.common.response.DataResponse;
import com.eodilog.global.common.response.PageResponse;
import com.eodilog.global.security.AuthUser;
import com.eodilog.timeline.TimelineDtos.*;
import com.eodilog.trip.controller.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "피드·지도·타임라인", description = "내 여행 타임라인과 여행 내부 기록 요약")
@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class TimelineController {

	private final TimelineQueryService service;

	@Operation(summary = "내 여행 타임라인", description = "본인이 현재 ACTIVE 멤버인 비삭제 여행을 시작일 DESC NULLS LAST, tripId DESC로 조회한다. 게시 전·날짜 미정 여행을 포함하며 feedId는 null이다. 상태는 Asia/Seoul 날짜 기준이다.")
	@ApiResponse(responseCode = "200", description = "조회 성공")
	@GetMapping("/me/timeline")
	public PageResponse<TimelineItem> myTimeline(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user,
			@Parameter(description = "이전 page.nextCursor. 첫 조회 시 생략") @RequestParam(required = false) String cursor,
			@Parameter(description = "페이지 크기(1~100)", example = "20")
			@RequestParam(defaultValue = "20") @Min(1) @Max(TimelineQueryService.MAX_LIMIT) int limit) {
		return service.myTimeline(CurrentUser.requireUserId(user), cursor, limit);
	}

	@Operation(summary = "여행 장소 타임라인", description = "ACTIVE 멤버만 조회한다. 반복 코스 항목과 코스 밖 방문을 포함한다. 방문은 최초 비삭제 시각, 사진은 비삭제 원본으로 집계하며 이탈 멤버의 남아 있는 기록도 포함한다. 거리는 같은 날 다음 항목까지 저장된 구간이다. 외부 조회·재계산은 하지 않는다.")
	@ApiResponse(responseCode = "200", description = "조회 성공")
	@ApiResponse(responseCode = "404", description = "TRIP_NOT_FOUND: 없는·삭제된·비참여·이탈 여행")
	@GetMapping("/trips/{tripId}/timeline")
	public DataResponse<PlaceTimeline> tripTimeline(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user,
			@Parameter(description = "여행 ID(UUID)") @PathVariable UUID tripId) {
		return DataResponse.of(service.tripTimeline(CurrentUser.requireUserId(user), tripId));
	}

	@Operation(summary = "여행 기록 요약", description = "ACTIVE 멤버만 조회한다. 비삭제 사진·고유 방문 장소/지역·경비 원금을 독립 집계한다. 계획 거리는 같은 날 인접 구간이 모두 유효할 때만 합산하며 구간 없음·누락·실패는 null이다. 실제 거리는 null이고 경비가 없으면 원금도 null이다. 외부 호출·DB 변경은 하지 않는다.")
	@ApiResponse(responseCode = "200", description = "조회 성공")
	@ApiResponse(responseCode = "404", description = "TRIP_NOT_FOUND: 없는·삭제된·비참여·이탈 여행")
	@GetMapping("/trips/{tripId}/summary")
	public DataResponse<TripSummary> tripSummary(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user,
			@Parameter(description = "여행 ID(UUID)") @PathVariable UUID tripId) {
		return DataResponse.of(service.tripSummary(CurrentUser.requireUserId(user), tripId));
	}
}
