package com.eodilog.region.controller;

import java.util.UUID;
import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.region.dto.*;
import com.eodilog.region.service.RegionService;
import com.eodilog.global.common.response.*;
import com.eodilog.global.security.AuthUser;
import com.eodilog.trip.controller.CurrentUser;
import io.swagger.v3.oas.annotations.*;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@Tag(name = "지역", description = "법정동 지역 검색·상세 조회")
@RestController
@RequestMapping("/api/v1/regions")
public class RegionController {
    private final RegionService service;
    public RegionController(RegionService service) { this.service = service; }
    @Operation(summary = "지역 검색", description = "로그인·가입 완료 사용자. 이름의 문자 그대로 부분 검색. query는 strip 후 1~200자, limit 1~100(기본20). code ASC,id ASC 전용 커서는 같은 query에서만 사용한다.")
    @ApiResponse(responseCode = "200", description = "조회 성공")
    @GetMapping
    public PageResponse<RegionView> search(
            @Parameter(description = "지역 이름 검색어", example = "서울") @RequestParam String query,
            @Parameter(description = "이전 응답의 nextCursor") @RequestParam(required = false) String cursor,
            @Parameter(description = "페이지 크기 1~100", example = "20") @RequestParam(defaultValue = "20") int limit) {
        return service.search(query, cursor, limit);
    }
    @Operation(summary = "지역 상세 조회", description = "로그인·가입 완료 사용자. introduction은 항상 null, partialErrors는 외부 호출이 없어 항상 빈 목록이다."
            + " representativePlaces는 최대 5개로, 이 지역과 하위 지역(예: 시·도 아래 시·군·구)의 게시 스냅샷 장소(게시 시점 장소 지역 기준)를"
            + " 요청자에게 허용된 살아 있는 게시 피드 수(서로 다른 피드 수) 내림차순, 같으면 장소 ID 오름차순으로 정렬한다."
            + " 허용된 피드: 피드와 여행이 삭제되지 않았고, 현재 ACTIVE 멤버 경로 하나 이상이 요청자에게 열려 있다(멤버 계정이 ACTIVE·가입 완료이고"
            + " 본인·PUBLIC 또는 ACCEPTED 팔로우인 PRIVATE이며 그 멤버가 요청자를 숨기지 않음. 본인 경로는 본인 숨김을 무시). 장소 행이 없어진 장소는 빠진다.")
    @ApiResponse(responseCode = "200", description = "조회 성공")
    @ApiResponse(responseCode = "404", description = "REGION_NOT_FOUND: 없는 지역")
    @GetMapping("/{regionId}")
    public DataResponse<RegionDetail> detail(@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user,
            @Parameter(description = "지역 UUID") @PathVariable String regionId) {
        if (!regionId.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) {
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
        }
        return DataResponse.of(service.detail(CurrentUser.requireUserId(user), UUID.fromString(regionId)));
    }
}
