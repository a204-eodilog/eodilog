package com.eodilog.feed;

import com.eodilog.feed.FeedDtos.*;
import com.eodilog.feed.FeedRequests.*;
import com.eodilog.global.common.response.*;
import com.eodilog.global.security.AuthUser;
import com.eodilog.job.JobRef;
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
        return DataResponse.of(service.get(CurrentUser.requireUserId(user),feedId));
    }
    @GetMapping("/feeds/{feedId}/summary")
    @Operation(summary="공동 피드 요약",description="로그인 사용자 전체(직접 링크와 같은 열람 범위). 게시 표현만 집계한다: 원본이 남은 게시 사진 수, 게시 시각까지 기록되어 남아 있는 방문이 있는 게시 장소 수·그 지역 수, 공개 코스의 같은 날 인접 구간 거리 합(누락·실패면 null), 게시 시점 경비 원금. 내부 정산·멤버 명단은 없다. 삭제된 피드는 404.")
    @ApiResponse(responseCode="200",description="조회 성공")
    public DataResponse<FeedSummary> summary(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user,@PathVariable UUID feedId) {
        CurrentUser.requireUserId(user);
        return DataResponse.of(service.summary(feedId));
    }
    @PutMapping("/feeds/{feedId}/like")
    @Operation(summary="피드 좋아요",description="로그인 사용자 전체(직접 링크와 같은 열람 범위). 사용자·피드당 하나이며 반복해도 같다. 삭제된 피드는 404. 재게시 피드는 새 ID라 0부터 센다. 방문·평가로 집계하지 않는다.")
    @ApiResponse(responseCode="200",description="좋아요 상태와 현재 수")
    public DataResponse<LikeResult> like(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user,@PathVariable UUID feedId) {
        return DataResponse.of(service.like(CurrentUser.requireUserId(user),feedId));
    }
    @DeleteMapping("/feeds/{feedId}/like")
    @Operation(summary="피드 좋아요 취소",description="본인 좋아요만 지운다. 좋아요가 없어도 204. 삭제된 피드는 404.")
    @ApiResponse(responseCode="204",description="취소됨")
    public ResponseEntity<Void> unlike(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user,@PathVariable UUID feedId) {
        service.unlike(CurrentUser.requireUserId(user),feedId);
        return ResponseEntity.noContent().build();
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
    @PostMapping("/feeds/{feedId}/delete-own-records")
    @Operation(summary="공동 피드 내리기와 내 기록 삭제",description="""
            현재 게시된 피드 여행의 ACTIVE 멤버 본인만 요청한다. expectedVersion이 다르면 409이고 아무것도 바꾸지 않는다.
            접수 즉시 피드를 일반 삭제와 같이 내리고 동행에게 알린 뒤, 요청 시점의 본인 사진·방문·평가를 숨기고 ID로 고정해 정리 작업을 등록한다.
            작업은 고정한 본인 기록만 지운다(평가 → 방문 → 사진·파일). 동행의 기록, 공동 경비·정산, 여행과 멤버십은 유지하며 여행 나가기·여행 삭제가 아니다.
            접수 뒤 새로 만든 기록과 새로 게시한 피드는 건드리지 않고, 이후 여행을 나가도 고정한 범위는 끝까지 지운다.
            진행은 GET /api/v1/jobs/{jobId}로 요청자만 조회한다. 피드가 내려간 뒤 다시 요청하면 현재 피드가 아니므로 404 FEED_NOT_FOUND다.
            없는 피드·비멤버·이탈 멤버도 같은 404 FEED_NOT_FOUND다. Idempotency-Key는 받지 않는다.""")
    @ApiResponse(responseCode="202",description="접수됨. 정리 작업 참조") @ApiResponse(responseCode="409",description="VERSION_CONFLICT: 피드 버전이 다름")
    public ResponseEntity<DataResponse<JobRef>> deleteOwnRecords(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user,@PathVariable UUID feedId,@Valid @RequestBody OwnRecordsDelete request) {
        return ResponseEntity.accepted().body(DataResponse.of(service.deleteOwnRecords(CurrentUser.requireUserId(user),feedId,request.expectedVersion())));
    }
    @PutMapping("/feeds/{feedId}/visibility/me")
    @Operation(summary="본인 피드 노출 설정 교체",description="현재 ACTIVE 멤버의 본인 경로 숨길 회원 목록만 전체 교체한다. 독립 설정 expectedVersion을 검사하며 직접 피드·파일 링크는 막지 않는다.")
    @ApiResponse(responseCode="200",description="본인 설정") @ApiResponse(responseCode="409",description="VERSION_CONFLICT")
    public DataResponse<FeedVisibility> visibility(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user,@PathVariable UUID feedId,@Valid @RequestBody VisibilityWrite request) {
        return DataResponse.of(service.visibility(CurrentUser.requireUserId(user),feedId,request));
    }
}
