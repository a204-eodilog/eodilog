package com.eodilog.place.service;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.response.PageResponse;
import com.eodilog.global.id.UuidV7;
import com.eodilog.place.dto.PlaceView;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Clock;
import java.util.*;
import org.springframework.jdbc.core.namedparam.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PlaceCatalogService {
    private final NamedParameterJdbcTemplate jdbc;
    private final PlaceReader reader;
    private final Clock clock;
    public PlaceCatalogService(NamedParameterJdbcTemplate jdbc, PlaceReader reader, Clock clock) {
        this.jdbc = jdbc; this.reader = reader; this.clock = clock;
    }

    @Transactional(readOnly = true)
    public PageResponse<PlaceView> search(String query, UUID regionId, UUID cursor, int limit) {
        if (query == null || query.isBlank() || query.length() > 200 || limit < 1 || limit > 100)
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
        var params = new MapSqlParameterSource().addValue("query", "%" + query.strip().toLowerCase(Locale.ROOT)
                .replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%")
                .addValue("limit", limit + 1);
        StringBuilder sql = new StringBuilder("SELECT " + JdbcPlaceReader.COLUMNS + " FROM places WHERE lower(name) LIKE :query ESCAPE '\\'");
        if (regionId != null) { sql.append(" AND region_id=:regionId"); params.addValue("regionId", regionId); }
        if (cursor != null) { sql.append(" AND id>:cursor"); params.addValue("cursor", cursor); }
        sql.append(" ORDER BY id LIMIT :limit");
        var rows = jdbc.query(sql.toString(), params, JdbcPlaceReader::map);
        boolean hasNext = rows.size() > limit;
        var page = List.copyOf(rows.subList(0, Math.min(rows.size(), limit)));
        return PageResponse.of(page, hasNext ? page.getLast().id().toString() : null, hasNext);
    }

    @Transactional(readOnly = true)
    public PlaceView detail(UUID id) {
        return reader.find(id).orElseThrow(() -> new BusinessException(CommonErrorCode.NOT_FOUND));
    }

    @Transactional
    public PlaceView createManual(String name, String address, BigDecimal latitude, BigDecimal longitude, UUID regionId) {
        if (name == null || name.isBlank() || name.length() > 255 || address != null && address.length() > 500
                || latitude == null || longitude == null || latitude.compareTo(BigDecimal.valueOf(-90)) < 0
                || latitude.compareTo(BigDecimal.valueOf(90)) > 0 || longitude.compareTo(BigDecimal.valueOf(-180)) < 0
                || longitude.compareTo(BigDecimal.valueOf(180)) > 0)
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
        if (regionId != null && jdbc.queryForObject("SELECT count(*) FROM regions WHERE id=:id", Map.of("id", regionId), Integer.class) == 0)
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
        UUID id = UuidV7.generate();
        var params = new MapSqlParameterSource().addValue("id", id).addValue("name", name.strip())
                .addValue("address", address).addValue("latitude", latitude).addValue("longitude", longitude)
                .addValue("regionId", regionId).addValue("now", Timestamp.from(clock.instant()));
        jdbc.update("INSERT INTO places(id,region_id,name,address,latitude,longitude,source,created_at,updated_at)"
                + " VALUES(:id,:regionId,:name,:address,:latitude,:longitude,'MANUAL',:now,:now)", params);
        return detail(id);
    }
}
