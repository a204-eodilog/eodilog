package com.eodilog.region.service;

import java.util.*;
import com.eodilog.region.dto.*;
import com.eodilog.region.RegionErrorCode;
import com.eodilog.global.common.error.*;
import com.eodilog.global.common.response.PageResponse;
import com.eodilog.place.service.PlaceReader;
import com.eodilog.feed.FeedExposureRepository;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class RegionService {
    static final int REPRESENTATIVE_PLACE_LIMIT = 5;
    private final NamedParameterJdbcTemplate jdbc;
    private final RegionReader reader;
    private final PlaceReader places;
    private final FeedExposureRepository feeds;
    public RegionService(NamedParameterJdbcTemplate jdbc, RegionReader reader, PlaceReader places, FeedExposureRepository feeds) {
        this.jdbc = jdbc; this.reader = reader; this.places = places; this.feeds = feeds;
    }
    public PageResponse<RegionView> search(String query, String cursor, int limit) {
        if (query == null) throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
        query = query.strip();
        if (query.isEmpty() || query.length() > 200 || query.indexOf('\0') >= 0 || limit < 1 || limit > 100) throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
        var params = new HashMap<String, Object>();
        params.put("query", query); params.put("limit", limit + 1);
        String after = "";
        if (cursor != null) {
            var decoded = RegionCursor.decode(cursor, query);
            params.put("code", decoded.code()); params.put("id", decoded.id());
            after = " AND (code,id) > (:code,:id)";
        }
        // strpos treats %, _ and backslashes as ordinary characters.
        var items = jdbc.query("SELECT " + JdbcRegionReader.COLUMNS + " FROM regions WHERE strpos(name,:query)>0"
                + after + " ORDER BY code ASC,id ASC LIMIT :limit", params, JdbcRegionReader::map);
        boolean hasNext = items.size() > limit;
        var page = List.copyOf(items.subList(0, Math.min(items.size(), limit)));
        String next = hasNext ? new RegionCursor(query, page.getLast().code(), page.getLast().id()).encode() : null;
        return PageResponse.of(page, next, hasNext);
    }
    public RegionDetail detail(UUID viewer, UUID id) {
        var region = reader.find(id).orElseThrow(() -> new BusinessException(RegionErrorCode.REGION_NOT_FOUND));
        var ids = feeds.regionPlaces(viewer, id, REPRESENTATIVE_PLACE_LIMIT);
        // The ranking already skips places without a row; one deleted between the two reads is dropped (fewer than 5).
        var found = places.findAll(ids);
        return RegionDetail.of(region, ids.stream().filter(found::containsKey).map(found::get).toList());
    }
}
