package com.eodilog.region.controller;

import java.util.UUID;
import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.region.dto.*;
import com.eodilog.region.service.RegionService;
import com.eodilog.global.common.response.*;
import io.swagger.v3.oas.annotations.*;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
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
    @Operation(summary = "지역 상세 조회", description = "로그인·가입 완료 사용자. 소개는 null, 대표 장소와 부분 오류는 빈 목록이다.")
    @ApiResponse(responseCode = "200", description = "조회 성공")
    @ApiResponse(responseCode = "404", description = "REGION_NOT_FOUND: 없는 지역")
    @GetMapping("/{regionId}")
    public DataResponse<RegionDetail> detail(@Parameter(description = "지역 UUID") @PathVariable String regionId) {
        if (!regionId.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) {
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
        }
        return DataResponse.of(service.detail(UUID.fromString(regionId)));
    }
}
