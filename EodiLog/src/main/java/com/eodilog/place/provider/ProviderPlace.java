package com.eodilog.place.provider;

import java.math.BigDecimal;

/**
 * 공급자가 돌려준 장소 한 건. regionCode는 공급자 구현이 일반구·세종 규칙을 적용한 법정동 코드이며 모르면 null이다.
 * category는 공급자 분류 문자열(예: 네이버 `여행,명소>해수욕장`)이며 모르면 null이다. 날씨 대안의 실내·실외 판단에만 쓴다.
 */
public record ProviderPlace(String providerPlaceId, String name, String address, BigDecimal latitude,
		BigDecimal longitude, String regionCode, String category) {
}
