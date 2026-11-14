package com.eodilog.place.importer;

import java.math.BigDecimal;

// category는 공급자 분류 이름을 '>'로 이은 값이며 모르면 null이다(날씨 대안 실내 판단, 앱 업종 아이콘).
// imageUrl은 대표 사진 원본 주소(관광공사 firstimage)이며 없으면 null이다
record PublicPlaceRow(String provider, String externalId, String name, String address,
        BigDecimal latitude, BigDecimal longitude, String regionCode, String category, String imageUrl) {
    PublicPlaceRow(String provider, String externalId, String name, String address,
            BigDecimal latitude, BigDecimal longitude, String regionCode) {
        this(provider, externalId, name, address, latitude, longitude, regionCode, null, null);
    }
    PublicPlaceRow(String provider, String externalId, String name, String address,
            BigDecimal latitude, BigDecimal longitude, String regionCode, String category) {
        this(provider, externalId, name, address, latitude, longitude, regionCode, category, null);
    }

    String normalizedCategory() {
        if (category == null || category.isBlank()) return null;
        String value = category.strip();
        return value.length() > 200 ? value.substring(0, 200).strip() : value;
    }

    /** places.image_url 제약(빈 문자열 금지, 1000자)에 맞춘다. http(s) 주소만 받는다 */
    String normalizedImageUrl() {
        if (imageUrl == null) return null;
        String value = imageUrl.strip();
        if (value.isEmpty() || value.length() > 1000 || !value.matches("(?i)https?://.+")) return null;
        // 안드로이드 앱은 평문 http 그림을 막는다. 관광공사 사진 서버는 https도 받는다
        return value.replaceFirst("(?i)^http://", "https://");
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
