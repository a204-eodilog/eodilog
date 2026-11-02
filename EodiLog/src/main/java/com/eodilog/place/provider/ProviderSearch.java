package com.eodilog.place.provider;

import java.math.BigDecimal;

/** 좌표가 있으면 반경 안에서 찾는다. page는 1부터 시작하는 공급자 쪽 번호다. */
public record ProviderSearch(String query, BigDecimal latitude, BigDecimal longitude, Integer radiusMeters, int page) {
}
