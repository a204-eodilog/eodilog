package com.eodilog.trend;

import com.eodilog.global.common.response.PageResponse;
import com.eodilog.global.security.AuthUser;
import com.eodilog.trip.controller.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/trends")
@RequiredArgsConstructor
@Tag(name="트렌드",description="최근 트렌드 여행지: 기간 안 게시 여행 수 기준 지역 순위")
public class TrendController {
    private final TrendService service;

    @GetMapping("/regions")
    @Operation(summary="지역 트렌드 순위",description="로그인 사용자. 권한 필터 후 집계한다: 삭제되지 않은 게시 피드 중 현재 ACTIVE 여행 멤버 한 명 이상이"
            + " 요청자 본인이거나 PUBLIC 계정이거나 요청자가 ACCEPTED로 팔로우하는 PRIVATE 계정이고 그 멤버가 요청자를 숨기지 않은 피드만 센다(팔로우 없이도 PUBLIC 멤버 피드는 센다)."
            + " 피드 기간은 게시 스냅샷 여행 기간이며 날짜 미정 피드는 게시일(Asia/Seoul)로 본다. 기간이 [from,to]와 겹치면 포함한다."
            + " 지역은 스냅샷 지역별로 묶고 단계를 합치지 않으며 한 피드는 지역마다 한 번 센다."
            + " publishedTripCount DESC로 순위를 매기고 같은 수는 같은 순위(1,1,3), 같은 순위 안은 지역 코드 ASC로 나열하며 이 순서로 페이지를 나눈다."
            + " 직전 기간은 from 전날로 끝나는 같은 일수이며 그 기간 순위가 previousRank, rankChange=previousRank-rank, 없으면 isNew=true·둘 다 null."
            + " followingCount는 요청자가 ACCEPTED로 팔로우하는 회원이 경로인 피드 수, sampleSize는 기간 안 집계된 피드 수(지역 중복 없이), sampleSize<5면 insufficientData=true."
            + " 요청 때 계산하며 updatedAt은 계산 시각이다. 기간은 최대 366일이고 연도는 1900~9999, from>to·366일 초과·범위 밖 연도·형식 오류는 400.")
    @ApiResponse(responseCode="200",description="조회 성공")
    public PageResponse<TrendRegion> regions(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user,
            @Parameter(description="집계 시작일",example="2026-10-12",required=true) @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
            @Parameter(description="집계 종료일(포함)",example="2026-11-10",required=true) @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to,
            @Parameter(description="이전 page.nextCursor") @RequestParam(required=false) String cursor,
            @Parameter(description="페이지 크기(1~100)") @RequestParam(defaultValue="20") @Min(1) @Max(100) int limit) {
        return service.regions(CurrentUser.requireUserId(user),from,to,cursor,limit);
    }
}
