package com.eodilog.place.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record BookmarkView(PlaceView place, RetainedPlace retainedPlace, String memo,
        UUID sourceFeedId, boolean sourceUnavailable, Instant createdAt) {
    public record RetainedPlace(String name, BigDecimal latitude, BigDecimal longitude) {}
}
