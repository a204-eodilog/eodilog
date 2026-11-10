package com.eodilog.place.importer;

import java.math.BigDecimal;

// category는 공급자 분류 이름을 '>'로 이은 값이며 모르면 null이다(날씨 대안 실내 판단용)
record PublicPlaceRow(String provider, String externalId, String name, String address,
        BigDecimal latitude, BigDecimal longitude, String regionCode, String category) {
    PublicPlaceRow(String provider, String externalId, String name, String address,
            BigDecimal latitude, BigDecimal longitude, String regionCode) {
        this(provider, externalId, name, address, latitude, longitude, regionCode, null);
    }

    String normalizedCategory() {
        if (category == null || category.isBlank()) return null;
        String value = category.strip();
        return value.length() > 200 ? value.substring(0, 200).strip() : value;
    }

    boolean valid() {
        return provider != null && !provider.isBlank() && provider.length() <= 32
                && externalId != null && !externalId.isBlank() && externalId.length() <= 255
                && name != null && !name.isBlank() && name.length() <= 255
                && (address == null || address.length() <= 500)
                && latitude != null && longitude != null
                && latitude.compareTo(BigDecimal.valueOf(-90)) >= 0
                && latitude.compareTo(BigDecimal.valueOf(90)) <= 0
                && longitude.compareTo(BigDecimal.valueOf(-180)) >= 0
                && longitude.compareTo(BigDecimal.valueOf(180)) <= 0;
    }
}
