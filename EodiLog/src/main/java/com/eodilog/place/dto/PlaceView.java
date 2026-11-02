package com.eodilog.place.dto;

import java.math.BigDecimal;
import java.util.UUID;
import com.eodilog.place.domain.PlaceSource;

// 명세 Place DTO와 같은 모양의 읽기 전용 값. 다른 도메인은 저장 구조 대신 이 값만 받는다
public record PlaceView(UUID id, String name, String address, BigDecimal latitude, BigDecimal longitude,
		UUID regionId, String provider, String providerPlaceId, PlaceSource source) {
}
