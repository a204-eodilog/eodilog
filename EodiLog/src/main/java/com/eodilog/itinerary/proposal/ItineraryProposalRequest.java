package com.eodilog.itinerary.proposal;

import com.eodilog.itinerary.domain.TransportMode;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;

// 명세 §10 ProposalWrite. 이번에는 reason=INITIAL만 받는다(정책 I-1). 나머지 필드는 다른 사유용이라 INITIAL에 오면 400
public record ItineraryProposalRequest(
		@Schema(description = "제안 사유. 지금은 INITIAL(모은 장소로 날짜별 코스 생성)만 지원한다", example = "INITIAL",
				requiredMode = Schema.RequiredMode.REQUIRED)
		ProposalReason reason,

		@Schema(description = "GET /itinerary로 받은 코스 version. 다르면 409", example = "3",
				requiredMode = Schema.RequiredMode.REQUIRED)
		Long expectedVersion,

		@Schema(description = "새 구간에 쓸 기본 이동 수단. 생략하면 TRANSIT. 결과는 구간별 수단이다(가까우면 WALK 등)",
				example = "TRANSIT", nullable = true)
		TransportMode defaultTransportMode,

		@Schema(description = "PLACE_REMOVED용(아직 미지원). INITIAL에는 보내지 않는다", nullable = true)
		List<UUID> excludedPlaceIds,

		@Schema(description = "WEATHER용(아직 미지원). INITIAL에는 보내지 않는다", nullable = true)
		UUID sourceWeatherJobId,

		@Schema(description = "WEATHER용(아직 미지원). INITIAL에는 보내지 않는다", nullable = true)
		UUID selectedAlternativeId
) {
}
