package com.eodilog.place.importer;

import java.math.BigDecimal;

record PublicPlaceRow(String provider, String externalId, String name, String address,
        BigDecimal latitude, BigDecimal longitude, String regionCode) {
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
