package com.eodilog.place.dto;

import com.eodilog.global.common.response.PageInfo;
import java.util.List;

public record SavedPlacePage(List<SavedPlaceView> items, Totals totals, PageInfo page) {
    public record Totals(long allPlaceCount, long overlapPlaceCount, long filteredCount) {}
}
