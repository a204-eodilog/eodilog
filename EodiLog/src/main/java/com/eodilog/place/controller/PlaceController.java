package com.eodilog.place.controller;

import com.eodilog.global.common.response.*;
import com.eodilog.place.dto.PlaceView;
import com.eodilog.place.service.PlaceCatalogService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@Tag(name = "Places")
@RestController
@RequestMapping("/api/v1/places")
public class PlaceController {
    private final PlaceCatalogService service;
    public PlaceController(PlaceCatalogService service) { this.service = service; }

    @Operation(summary = "장소 검색", description = "로그인. 전국 장소 목록에서 이름 부분 일치(대소문자 무시)로 찾는다. "
            + "near가 있으면 30km 안 이름 완전 일치(가까운 순) → 30km 안 나머지(가까운 순) → 30km 밖 완전 일치(가까운 순) → 30km 밖 나머지(id 순), "
            + "없으면 완전 일치(id 순) → 앞부분 일치(이름순) → 그 밖의 포함(id 순)으로 정렬한다. "
            + "완전·앞부분 일치는 앞뒤 공백을 무시한다. 커서는 같은 query·near·regionId에서만 쓸 수 있고, 다르면 400 VALIDATION_ERROR")
    @GetMapping
    public PageResponse<PlaceView> search(
            @Parameter(description = "검색어(앞뒤 공백 제거 후 1~200자)", example = "서울역") @RequestParam String query,
            @Parameter(description = "가까운 순 기준 좌표 '위도,경도'. 위도 -90~90, 경도 -180~180", example = "37.5547,126.9707")
            @RequestParam(required = false) String near,
            @Parameter(description = "지역 ID(UUID). 주면 그 지역 장소만") @RequestParam(required = false) UUID regionId,
            @Parameter(description = "직전 응답의 page.nextCursor") @RequestParam(required = false) String cursor,
            @Parameter(description = "1~100", example = "20") @RequestParam(defaultValue = "20") int limit) {
        return service.search(query, near, regionId, cursor, limit);
    }

    @Operation(summary = "Get a place by its local UUID")
    @GetMapping("/{placeId}")
    public DataResponse<PlaceView> detail(@PathVariable UUID placeId) { return DataResponse.of(service.detail(placeId)); }

    @Operation(summary = "Register a place missing from the public catalog")
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public DataResponse<PlaceView> create(@Valid @RequestBody ManualPlaceRequest request) {
        return DataResponse.of(service.createManual(request.name(), request.address(), request.latitude(), request.longitude(), request.regionId()));
    }

    public record ManualPlaceRequest(@NotBlank @Size(max = 255) String name, @Size(max = 500) String address,
            @NotNull @DecimalMin("-90") @DecimalMax("90") BigDecimal latitude,
            @NotNull @DecimalMin("-180") @DecimalMax("180") BigDecimal longitude, UUID regionId) {}
}
