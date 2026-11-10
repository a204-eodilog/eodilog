package com.eodilog.feed;

import com.eodilog.feed.FeedDtos.*;
import com.eodilog.global.common.response.*;
import com.eodilog.global.security.AuthUser;
import com.eodilog.timeline.TimelineDtos.TimelineItem;
import com.eodilog.trip.controller.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.*;
import java.time.LocalDate;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@Tag(name="피드·지도·타임라인",description="회원 경로별 공동 피드 노출: 홈 지도, 회원 피드·지도·타임라인, 내 여행 지도")
public class FeedExposureController {
    private static final String BBOX="minLongitude,minLatitude,maxLongitude,maxLatitude. 좌표가 없는 지역은 범위와 상관없이 포함한다";
    private static final String MAP_RULES=" 마커는 피드 게시 스냅샷의 지역별(regionGrouping=FEED_REGION)이며 지역 단계를 합치지 않는다. from·to는 스냅샷 여행 기간이 겹치는 피드만 남기고 지정하면 날짜 미정 피드는 빠진다. visitCount는 해당 피드 여행에서 게시 시각까지 기록된 비삭제 방문 중 게시 스냅샷의 장소 지역이 그 마커 지역과 같은 수다. 마커 지역 정보는 현재 지역 표의 값이다. 비허용 피드의 수·위치는 내보내지 않는다.";
    private final FeedExposureService service;

    @GetMapping("/home/map")
    @Operation(summary="홈 지도",description="로그인 사용자. ACCEPTED 팔로우한 회원(본인 제외)의 경로별로 계정 공개 범위와 해당 멤버의 숨김을 판정한 뒤 feedId로 중복 제거한다. 경로는 피드 여행의 현재 ACTIVE 멤버만이다. visibleMemberUserIds는 허용된 멤버만 담는다."+MAP_RULES)
    @ApiResponse(responseCode="200",description="조회 성공")
    public DataResponse<MapResult> homeMap(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user,
            @Parameter(description=BBOX,example="124,33,132,39") @RequestParam String bbox,
            @Parameter(description="기간 시작일") @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
            @Parameter(description="기간 종료일") @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to) {
        return DataResponse.of(service.homeMap(CurrentUser.requireUserId(user),bbox,from,to));
    }
    @GetMapping("/home/regions/{regionId}/feeds")
    @Operation(summary="홈 지역 피드 목록",description="로그인 사용자. 홈 지도와 같은 경로별 판정 후 스냅샷 지역에 regionId가 있는 피드를 게시 시각 DESC, ID DESC로 페이지 분할한다. 없는 지역은 빈 목록이다.")
    @ApiResponse(responseCode="200",description="조회 성공")
    public PageResponse<FeedCard> regionFeeds(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user,
            @Parameter(description="지역 ID(UUID)") @PathVariable UUID regionId,
            @Parameter(description="이전 page.nextCursor") @RequestParam(required=false) String cursor,
            @Parameter(description="페이지 크기(1~100)") @RequestParam(defaultValue="20") @Min(1) @Max(100) int limit) {
        return service.regionFeeds(CurrentUser.requireUserId(user),regionId,cursor,limit);
    }
    @GetMapping("/users/{userId}/feeds")
    @Operation(summary="회원 피드 목록",description="로그인 사용자. 대상 회원 경로만 본다: 대상이 현재 ACTIVE 멤버인 게시 피드 중 계정 공개 범위(PUBLIC·본인·ACCEPTED 팔로워)와 대상의 숨김을 통과한 것을 게시 시각 DESC, ID DESC로 필터 후 페이지 분할한다. 볼 수 없는 비공개 계정은 빈 목록이다.")
    @ApiResponse(responseCode="200",description="조회 성공") @ApiResponse(responseCode="404",description="USER_NOT_FOUND: 없는·탈퇴·가입 대기 회원")
    public PageResponse<FeedCard> userFeeds(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user,
            @Parameter(description="회원 ID(UUID)") @PathVariable UUID userId,
            @Parameter(description="이전 page.nextCursor") @RequestParam(required=false) String cursor,
            @Parameter(description="페이지 크기(1~100)") @RequestParam(defaultValue="20") @Min(1) @Max(100) int limit) {
        return service.userFeeds(CurrentUser.requireUserId(user),userId,cursor,limit);
    }
    @GetMapping("/users/{userId}/feed-map")
    @Operation(summary="회원 피드 지도",description="로그인 사용자. 회원 피드 목록과 같은 대상 경로 판정이며 직접 공동 피드 링크 권한과 분리한다. 볼 수 없는 비공개 계정은 빈 마커다."+MAP_RULES)
    @ApiResponse(responseCode="200",description="조회 성공") @ApiResponse(responseCode="404",description="USER_NOT_FOUND: 없는·탈퇴·가입 대기 회원")
    public DataResponse<MapResult> userFeedMap(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user,
            @Parameter(description="회원 ID(UUID)") @PathVariable UUID userId,
            @Parameter(description=BBOX,example="124,33,132,39") @RequestParam String bbox,
            @Parameter(description="기간 시작일") @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
            @Parameter(description="기간 종료일") @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to) {
        return DataResponse.of(service.userFeedMap(CurrentUser.requireUserId(user),userId,bbox,from,to));
    }
    @GetMapping("/users/{userId}/timeline")
    @Operation(summary="회원 타임라인",description="로그인 사용자. 대상 경로에서 허용된 게시 피드만 스냅샷 시작일 DESC NULLS LAST, tripId DESC로 필터 후 페이지 분할한다. 게시 전 여행은 없다. 상태는 Asia/Seoul 날짜 기준이다. 볼 수 없는 비공개 계정은 빈 목록이다.")
    @ApiResponse(responseCode="200",description="조회 성공") @ApiResponse(responseCode="404",description="USER_NOT_FOUND: 없는·탈퇴·가입 대기 회원")
    public PageResponse<TimelineItem> userTimeline(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user,
            @Parameter(description="회원 ID(UUID)") @PathVariable UUID userId,
            @Parameter(description="이전 page.nextCursor") @RequestParam(required=false) String cursor,
            @Parameter(description="페이지 크기(1~100)") @RequestParam(defaultValue="20") @Min(1) @Max(100) int limit) {
        return service.userTimeline(CurrentUser.requireUserId(user),userId,cursor,limit);
    }
    @GetMapping("/me/travel-map")
    @Operation(summary="내 여행 지도",description="본인. 현재 ACTIVE 멤버인 비삭제 여행을 지역별로 묶는다. 게시 여행은 피드 스냅샷 지역·기간, 미게시 여행은 현재 목적지와 비삭제 방문 장소 지역·여행 기간을 쓴다. viewerId를 주면 그 회원이 내 경로로 볼 수 있는 게시 피드만 남기고 hiddenTripCount를 준다. hiddenTripCount는 from·to 기간에 맞는 게시 피드 중 볼 수 없는 수이며 bbox와 무관하다. viewerId가 없으면 hiddenTripCount=null이다. 지역이 없는 여행은 unlocatedTripCount로 센다.")
    @ApiResponse(responseCode="200",description="조회 성공") @ApiResponse(responseCode="404",description="USER_NOT_FOUND: 없는·탈퇴·가입 대기 viewerId")
    public DataResponse<OwnMapResult> travelMap(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user,
            @Parameter(description=BBOX,example="124,33,132,39") @RequestParam String bbox,
            @Parameter(description="미리보기할 회원 ID(UUID)") @RequestParam(required=false) UUID viewerId,
            @Parameter(description="기간 시작일") @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
            @Parameter(description="기간 종료일") @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to) {
        return DataResponse.of(service.travelMap(CurrentUser.requireUserId(user),bbox,viewerId,from,to));
    }
    @GetMapping("/feeds/{feedId}/preview")
    @Operation(summary="회원 경로 노출 미리보기",description="피드 여행의 현재 ACTIVE 멤버가 본인 경로만 미리본다: viaMemberUserId는 요청자 본인이어야 하며, 아니거나 멤버가 아니면 404 FEED_NOT_FOUND다(숨김 목록은 본인만 보므로 다른 멤버 경로는 판정하지 않는다). viewerId가 내 경로로 이 피드를 볼 수 있는지 계정 공개 범위와 내 숨김을 각각 판정한다. 직접 링크 접근(항상 허용)과 다르다. 없는 viewerId는 visible=false다. feed의 likedByMe는 요청자 기준이다.")
    @ApiResponse(responseCode="200",description="판정 결과")
    public DataResponse<FeedPreview> preview(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user,
            @Parameter(description="피드 ID(UUID)") @PathVariable UUID feedId,
            @Parameter(description="볼 회원 ID(UUID)") @RequestParam UUID viewerId,
            @Parameter(description="경로 멤버 회원 ID(UUID)") @RequestParam UUID viaMemberUserId) {
        return DataResponse.of(service.preview(CurrentUser.requireUserId(user),feedId,viewerId,viaMemberUserId));
    }
}
