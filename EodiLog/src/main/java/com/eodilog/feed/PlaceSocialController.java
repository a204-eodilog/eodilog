package com.eodilog.feed;

import com.eodilog.feed.FeedDtos.PublishedReview;
import com.eodilog.global.common.response.DataResponse;
import com.eodilog.global.common.response.PageResponse;
import com.eodilog.global.security.AuthUser;
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
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/places/{placeId}")
@RequiredArgsConstructor
@Tag(name = "Places")
public class PlaceSocialController {
    private static final String ALLOWED="허용된 피드: 게시 스냅샷에 이 장소가 있는 살아 있는 공동 피드 중, 피드 여행의 현재 ACTIVE 멤버 경로 하나 이상이 요청자에게 열려 있는 것"
            +"(계정 공개 범위가 본인·PUBLIC 또는 ACCEPTED 팔로우인 PRIVATE이고 그 멤버가 요청자를 숨기지 않음. 팔로우하지 않은 PUBLIC 멤버도 경로가 된다. 본인 경로는 본인 숨김을 무시). "
            +"평가는 피드 단위 공개 규칙을 따른다: 허용된 피드면 그 게시 스냅샷의 이 장소 publicReviews를 작성자 개인 경로·숨김과 무관하게 모두 포함한다(공동 피드 상세와 같음). 방문자는 회원 경로 규칙을 따른다. "
            +"평가는 게시 스냅샷의 publicReviews만 쓰고, 원본 평가와 그 방문이 지금도 살아 있을 때만 포함한다. 비공개 원본 reviews는 직접 읽어 내보내지 않으며 비허용 피드의 수는 드러나지 않는다.";
    private final PlaceSocialService service;

    @GetMapping("/social-summary")
    @Operation(summary="장소 소셜 요약",description="로그인 사용자. "+ALLOWED
            +" visitorCount·visitors는 허용된 피드 여행에서 게시 시각까지 기록된 비삭제 방문의 방문자 중 그 피드에서 자신도 허용 경로인 회원(요청자 본인 제외)이며, visitors는 최근 방문 순 최대 20명이다."
            +" averageScore·reviewCount는 허용된 게시 평가로만 계산하고 평가가 없으면 averageScore는 null이다. 외부 호출이 없어 partialErrors는 항상 빈 배열이다.")
    @ApiResponse(responseCode="200",description="조회 성공")
    public DataResponse<PlaceSocialSummary> summary(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user,
            @Parameter(description="장소 ID(UUID)") @PathVariable UUID placeId) {
        return DataResponse.of(service.summary(CurrentUser.requireUserId(user),placeId));
    }

    @GetMapping("/public-reviews")
    @Operation(summary="장소 공개 평가 목록",description="로그인 사용자. "+ALLOWED
            +" writtenAt DESC, id DESC로 필터 후 키셋 페이지 분할한다. author는 요청자 기준 현재 회원 카드이며 회원 행이 없으면 탈퇴한 사용자 카드(이미지 null, 팔로우 상태 NONE)다.")
    @ApiResponse(responseCode="200",description="조회 성공")
    public PageResponse<PublishedReview> reviews(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user,
            @Parameter(description="장소 ID(UUID)") @PathVariable UUID placeId,
            @Parameter(description="이전 page.nextCursor") @RequestParam(required=false) String cursor,
            @Parameter(description="페이지 크기(1~100)") @RequestParam(defaultValue="20") @Min(1) @Max(100) int limit) {
        return service.reviews(CurrentUser.requireUserId(user),placeId,cursor,limit);
    }
}
