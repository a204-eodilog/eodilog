package com.eodilog.itinerary.dto;

import com.eodilog.place.domain.PlaceSource;
import com.eodilog.place.dto.PlaceView;
import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.util.UUID;

// 명세 §10 Place와 같은 모양. 장소 API(A)가 공용 응답 DTO를 내놓으면 그것으로 바꾼다. 장소 값은 PlaceReader로만 읽는다
public record ItineraryPlaceResponse(
		@Schema(description = "장소 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e20",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID id,

		@Schema(description = "장소 이름", example = "성산일출봉", requiredMode = Schema.RequiredMode.REQUIRED)
		String name,

		@Schema(description = "주소. 없으면 null", example = "제주특별자치도 서귀포시 성산읍", requiredMode = Schema.RequiredMode.REQUIRED,
				nullable = true)
		String address,

		@Schema(description = "위도", example = "33.4581", requiredMode = Schema.RequiredMode.REQUIRED)
		BigDecimal latitude,

		@Schema(description = "경도", example = "126.9425", requiredMode = Schema.RequiredMode.REQUIRED)
		BigDecimal longitude,

		@Schema(description = "지역 ID. 없으면 null", requiredMode = Schema.RequiredMode.REQUIRED, nullable = true)
		UUID regionId,

		@Schema(description = "공급자 이름. 직접 등록한 장소면 null", requiredMode = Schema.RequiredMode.REQUIRED, nullable = true)
		String provider,

		@Schema(description = "공급자 장소 ID. 직접 등록한 장소면 null", requiredMode = Schema.RequiredMode.REQUIRED,
				nullable = true)
		String providerPlaceId,

		@Schema(description = "PROVIDER: 공급자 장소 / MANUAL: 직접 등록", example = "MANUAL",
				requiredMode = Schema.RequiredMode.REQUIRED)
		PlaceSource source
) {

	public static ItineraryPlaceResponse from(PlaceView place) {
		return new ItineraryPlaceResponse(place.id(), place.name(), place.address(), place.latitude(),
				place.longitude(), place.regionId(), place.provider(), place.providerPlaceId(), place.source());
	}

}
