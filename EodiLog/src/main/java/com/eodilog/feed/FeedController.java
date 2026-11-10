package com.eodilog.feed;

import com.eodilog.feed.FeedDtos.*;
import com.eodilog.feed.FeedRequests.*;
import com.eodilog.global.common.response.*;
import com.eodilog.global.security.AuthUser;
import com.eodilog.trip.controller.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@Tag(name="피드",description="공동 피드 게시와 개인 노출 설정")
public class FeedController {
    private final FeedService service;
    @GetMapping("/trips/{tripId}/feed")
    @Operation(summary="여행의 현재 공동 피드",description="현재 ACTIVE 멤버만 조회한다. 미게시·삭제 후 data=null이며 조회로 생성하지 않는다.")
    @ApiResponse(responseCode="200",description="본인 설정을 포함한 피드 또는 null")
    public DataResponse<OwnFeed> trip(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user,@PathVariable UUID tripId) {
        return DataResponse.of(service.tripFeed(CurrentUser.requireUserId(user),tripId));
    }
    @PostMapping("/trips/{tripId}/feed")
    @Operation(summary="공동 피드 게시",description="ACTIVE 멤버가 여행을 공동 게시한다. 빈 본문 허용. 이미 게시 중이면 기존 피드 200, 새 게시는 201. 삭제 후 새 ID로 재게시한다. 게시 알림 없음.")
    @ApiResponse(responseCode="201",description="새 게시") @ApiResponse(responseCode="200",description="기존 게시 반환")
    public ResponseEntity<DataResponse<OwnFeed>> publish(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user,@PathVariable UUID tripId,@Valid @RequestBody FeedWrite request) {
        var result=service.publish(CurrentUser.requireUserId(user),tripId,request);
        return ResponseEntity.status(result.created()?201:200).body(DataResponse.of(result.feed()));
    }
    @GetMapping("/me/feeds")
    @Operation(summary="내 공동 피드 목록",description="본인이 현재 ACTIVE 멤버인 비삭제 여행의 게시 피드를 게시 시각 DESC, ID DESC로 조회한다. 본인 설정만 포함한다.")
    @ApiResponse(responseCode="200",description="조회 성공")
    public PageResponse<OwnFeed> list(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user,@RequestParam(required=false) String cursor,@RequestParam(defaultValue="20") @Min(1) @Max(100) int limit) {
        return service.list(CurrentUser.requireUserId(user),cursor,limit);
    }
    @GetMapping("/feeds/{feedId}")
    @Operation(summary="공동 피드 상세",description="로그인 사용자 전체에게 공개한다. 비공개 동행 계정·개인 경로 숨김은 직접 링크를 막지 않는다. 삭제된 피드는 404. 내부 정산과 개인 설정은 반환하지 않는다.")
    @ApiResponse(responseCode="200",description="공개 피드")
    public DataResponse<Feed> get(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user,@PathVariable UUID feedId) {
        CurrentUser.requireUserId(user);
        return DataResponse.of(service.get(feedId));
    }
    @PatchMapping("/feeds/{feedId}")
    @Operation(summary="공동 제목·본문 수정",description="현재 ACTIVE 멤버만 수정한다. expectedVersion 필수. 제목·본문 생략은 유지, null은 거부한다.")
    @ApiResponse(responseCode="200",description="수정 성공") @ApiResponse(responseCode="409",description="VERSION_CONFLICT")
    public DataResponse<OwnFeed> patch(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user,@PathVariable UUID feedId,@Valid @RequestBody FeedPatch request) {
        return DataResponse.of(service.patch(CurrentUser.requireUserId(user),feedId,request));
    }
    @DeleteMapping("/feeds/{feedId}")
    @Operation(summary="공동 피드 삭제",description="현재 ACTIVE 멤버만 삭제한다. expectedVersion 검사 후 게시 표현을 내리고 동행에게 알린다. 원본 여행·사진·방문·평가·경비는 보존한다.")
    @ApiResponse(responseCode="204",description="삭제 성공") @ApiResponse(responseCode="409",description="VERSION_CONFLICT")
    public ResponseEntity<Void> delete(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user,@PathVariable UUID feedId,@RequestParam @Min(1) long expectedVersion) {
        service.delete(CurrentUser.requireUserId(user),feedId,expectedVersion);
        return ResponseEntity.noContent().build();
    }
    @PutMapping("/feeds/{feedId}/visibility/me")
    @Operation(summary="본인 피드 노출 설정 교체",description="현재 ACTIVE 멤버의 본인 경로 숨길 회원 목록만 전체 교체한다. 독립 설정 expectedVersion을 검사하며 직접 피드·파일 링크는 막지 않는다.")
    @ApiResponse(responseCode="200",description="본인 설정") @ApiResponse(responseCode="409",description="VERSION_CONFLICT")
    public DataResponse<FeedVisibility> visibility(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user,@PathVariable UUID feedId,@Valid @RequestBody VisibilityWrite request) {
        return DataResponse.of(service.visibility(CurrentUser.requireUserId(user),feedId,request));
    }
}
