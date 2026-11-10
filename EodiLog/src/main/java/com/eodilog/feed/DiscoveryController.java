package com.eodilog.feed;

import com.eodilog.global.common.response.PageResponse;
import com.eodilog.global.security.AuthUser;
import com.eodilog.trip.controller.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/me")
@RequiredArgsConstructor
@Tag(name="추천",description="좋아요·등장 빈도 기반 피드·장소 둘러보기 추천")
public class DiscoveryController {
    private final DiscoveryService service;

    @GetMapping("/discovery-recommendations")
    @Operation(summary="둘러보기 추천",description="본인. 후보 피드: 서울 기준 오늘을 포함한 최근 30일(오늘-29일 00:00 KST 이후, 지금까지)에 게시된 살아 있는 공동 피드 중 "
            +"현재 ACTIVE 멤버 경로 하나 이상이 요청자에게 열려 있는 것(계정 공개 범위가 본인·PUBLIC 또는 ACCEPTED 팔로우인 PRIVATE이고 그 멤버가 요청자를 숨기지 않음). "
            +"요청자가 현재 ACTIVE 멤버인 여행의 피드(내 피드)는 제외한다. "
            +"FEED는 좋아요 수 DESC, 게시 시각 DESC, ID DESC, PLACE는 후보 피드 게시 스냅샷에 등장한 피드 수 DESC, 장소 ID DESC로 각각 SQL 키셋 페이지 분할하고 "
            +"FEED, PLACE를 하나씩 번갈아 놓는다(한쪽이 끝나면 나머지만 이어짐). reason은 '좋아요 N개'(0개면 '최근 30일 새 여행') 또는 '최근 30일 여행 N개에 등장'이며 후보 피드로만 센다. "
            +"커서는 첫 페이지에서 정한 기간(since·now)과 두 목록의 마지막 위치, 다음 종류를 담으므로 스크롤 중 기간은 움직이지 않는다. 페이지 사이에 좋아요가 바뀌면 피드 순서가 달라질 수 있다.")
    @ApiResponse(responseCode="200",description="조회 성공")
    public PageResponse<DiscoveryItem> recommendations(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user,
            @Parameter(description="이전 page.nextCursor") @RequestParam(required=false) String cursor,
            @Parameter(description="페이지 크기(1~100)") @RequestParam(defaultValue="20") @Min(1) @Max(100) int limit) {
        return service.recommendations(CurrentUser.requireUserId(user),cursor,limit);
    }
}
