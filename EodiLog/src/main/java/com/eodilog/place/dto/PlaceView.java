package com.eodilog.place.dto;

import java.math.BigDecimal;
import java.util.UUID;
import com.eodilog.place.domain.PlaceSource;

// 명세 Place DTO와 같은 모양의 읽기 전용 값. 다른 도메인은 저장 구조 대신 이 값만 받는다
// category는 공급자 분류 문자열(예: '음식>커피점/카페>카페', '카페,디저트>카페')이며 모르면 null이다.
// 앱이 사진 없는 장소에 업종 아이콘을 그릴 때 쓴다.
// imageUrl은 대표 사진 원본 주소(한국관광공사 firstimage)이며 없으면 null이다. 앱은 사진 아래에 출처를 적는다
public record PlaceView(UUID id, String name, String address, BigDecimal latitude, BigDecimal longitude,
		UUID regionId, String provider, String providerPlaceId, PlaceSource source, String category,
		String imageUrl) {
}
