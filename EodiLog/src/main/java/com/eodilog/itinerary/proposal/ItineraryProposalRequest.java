package com.eodilog.itinerary.proposal;

import com.eodilog.itinerary.domain.TransportMode;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;

// 명세 §10 ProposalWrite. reason은 INITIAL·WEATHER를 받는다(정책 I-1·W-24). 사유에 맞지 않는 필드가 오면 400
public record ItineraryProposalRequest(
		@Schema(description = "제안 사유. INITIAL(모은 장소로 날짜별 코스 생성) 또는 WEATHER(고른 날씨 대안 반영). PLACE_REMOVED는 아직 미지원",
				example = "INITIAL",
				requiredMode = Schema.RequiredMode.REQUIRED)
		ProposalReason reason,

		@Schema(description = "GET /itinerary로 받은 코스 version. 다르면 409", example = "3",
				requiredMode = Schema.RequiredMode.REQUIRED)
		Long expectedVersion,

		@Schema(description = "새 구간에 쓸 기본 이동 수단. 생략하면 TRANSIT. 결과는 구간별 수단이다(가까우면 WALK 등)",
				example = "TRANSIT", nullable = true)
		TransportMode defaultTransportMode,

		@Schema(description = "PLACE_REMOVED용(아직 미지원). INITIAL·WEATHER에는 보내지 않는다", nullable = true)
		List<UUID> excludedPlaceIds,

		@Schema(description = "WEATHER 필수: 같은 여행의 성공한 WEATHER_ALTERNATIVES 작업 ID. INITIAL에는 보내지 않는다",
				nullable = true)
		UUID sourceWeatherJobId,

		@Schema(description = "WEATHER 필수: 그 작업 결과의 alternativeId(TIME_SHIFT·PLACE_SWAP). INITIAL에는 보내지 않는다",
				nullable = true)
		UUID selectedAlternativeId
) {
}
