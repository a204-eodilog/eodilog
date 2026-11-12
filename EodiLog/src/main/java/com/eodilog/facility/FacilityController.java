package com.eodilog.facility;

import com.eodilog.global.common.response.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "Places")
@RestController
@RequestMapping("/api/v1/places/{placeId}/facilities")
public class FacilityController {

	private final FacilityService service;

	public FacilityController(FacilityService service) {
		this.service = service;
	}

	@Operation(summary = "주변 편의시설", description = "로그인. 기준 장소에서 반경 안의 시설을 가까운 순(직선거리)으로 준다(S28, Q-8). "
			+ "전기차 충전소는 환경공단 충전소 정보를 5분마다 갱신한 상태를 availability에 싣고, 확인하지 못했으면 null이다. "
			+ "약국·편의점·주유소는 공공데이터 장소의 업종·이름, 화장실은 공중화장실 공공데이터로 찾는다. 결과가 없으면 빈 목록, "
			+ "자료를 아직 받지 못했으면 503 FACILITY_UNAVAILABLE. 커서는 같은 장소·type·radiusMeters에서만 쓸 수 있다")
	@ApiResponse(responseCode = "200", description = "조회 성공(결과 없음은 빈 목록)")
	@ApiResponse(responseCode = "503", description = "FACILITY_UNAVAILABLE: 충전소 첫 적재 전이거나 화장실 자료가 없음")
	@GetMapping
	public PageResponse<FacilityView> nearby(
			@Parameter(description = "기준 장소 ID(UUID)") @PathVariable UUID placeId,
			@Parameter(description = "EV_CHARGER, GAS_STATION, TOILET, PHARMACY, CONVENIENCE_STORE", example = "EV_CHARGER")
			@RequestParam String type,
			@Parameter(description = "반경(m) 500~5000", example = "2000") @RequestParam(defaultValue = "2000") int radiusMeters,
			@Parameter(description = "직전 응답의 page.nextCursor") @RequestParam(required = false) String cursor,
			@Parameter(description = "1~100", example = "20") @RequestParam(defaultValue = "20") int limit) {
		return service.nearby(placeId, type, radiusMeters, cursor, limit);
	}

}
