package com.eodilog.place.service;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import com.eodilog.global.common.response.PageResponse;
import com.eodilog.global.id.UuidV7;
import com.eodilog.place.dto.PlaceView;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Clock;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
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

    private static final Pattern NEAR = Pattern.compile("(-?\\d{1,3}(?:\\.\\d{1,10})?)\\s*,\\s*(-?\\d{1,3}(?:\\.\\d{1,10})?)");
    // idx_places_location과 같은 식
    private static final String GEOGRAPHY = "ST_SetSRID(ST_MakePoint(longitude::double precision, latitude::double precision), 4326)::geography";

    /**
     * 이름 부분 일치 검색. near(위도,경도)가 있으면 이름 완전 일치 → 가까운 순 → id,
     * 없으면 완전 일치 → 앞부분 일치 → 포함 → 이름 짧은 순 → 이름순 → id로 정렬한다.
     * 일치 비교는 대소문자와 앞뒤 공백을 무시한다.
     */
    @Transactional(readOnly = true)
    public PageResponse<PlaceView> search(String query, String near, UUID regionId, String cursor, int limit) {
        if (query == null || query.isBlank() || query.length() > 200 || limit < 1 || limit > 100)
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
        String normalized = query.strip().toLowerCase(Locale.ROOT);
        double[] point = near == null ? null : parseNear(near);
        String canonicalNear = point == null ? null : point[0] + "," + point[1];
        String binding = PlaceSearchCursor.binding(normalized, canonicalNear, regionId);
        PlaceSearchCursor after = cursor == null ? null : PlaceSearchCursor.decode(cursor, binding, point != null);

        String escaped = normalized.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
        var params = new MapSqlParameterSource().addValue("contains", "%" + escaped + "%")
                .addValue("exact", normalized).addValue("limit", limit + 1);
        String rank, key, order, seek;
        if (point != null) {
            rank = "CASE WHEN lower(btrim(name))=:exact THEN 0 ELSE 1 END";
            key = "ST_Distance(" + GEOGRAPHY + ", ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography) AS distance";
            order = "s.rank, s.distance, s.id";
            seek = "(s.rank, s.distance, s.id) > (:afterRank, :afterDistance, :afterId)";
            params.addValue("latitude", point[0]).addValue("longitude", point[1]);
        } else {
            rank = "CASE WHEN lower(btrim(name))=:exact THEN 0 WHEN lower(btrim(name)) LIKE :prefix ESCAPE '\\' THEN 1 ELSE 2 END";
            key = "char_length(name) AS name_length";
            order = "s.rank, s.name_length, s.name, s.id";
            seek = "(s.rank, s.name_length, s.name, s.id) > (:afterRank, char_length(CAST(:afterName AS text)), :afterName, :afterId)";
            params.addValue("prefix", escaped + "%");
        }
        StringBuilder sql = new StringBuilder("SELECT * FROM (SELECT " + JdbcPlaceReader.COLUMNS + ", " + rank + " AS rank, " + key
                + " FROM places WHERE lower(name) LIKE :contains ESCAPE '\\'");
        if (regionId != null) { sql.append(" AND region_id=:regionId"); params.addValue("regionId", regionId); }
        sql.append(") s");
        if (after != null) {
            sql.append(" WHERE ").append(seek);
            params.addValue("afterRank", after.rank()).addValue("afterDistance", after.distance())
                    .addValue("afterName", after.name()).addValue("afterId", after.id());
        }
        sql.append(" ORDER BY ").append(order).append(" LIMIT :limit");
        List<PlaceSearchCursor> keys = new ArrayList<>();
        var rows = jdbc.query(sql.toString(), params, (rs, row) -> {
            PlaceView place = JdbcPlaceReader.map(rs, row);
            keys.add(new PlaceSearchCursor(binding, rs.getInt("rank"), point != null ? rs.getDouble("distance") : null,
                    point != null ? null : place.name(), place.id()));
            return place;
        });
        boolean hasNext = rows.size() > limit;
        var page = List.copyOf(rows.subList(0, Math.min(rows.size(), limit)));
        return PageResponse.of(page, hasNext ? keys.get(limit - 1).encode() : null, hasNext);
    }

    private static double[] parseNear(String near) {
        Matcher matcher = NEAR.matcher(near.strip());
        if (matcher.matches()) {
            double latitude = Double.parseDouble(matcher.group(1));
            double longitude = Double.parseDouble(matcher.group(2));
            if (latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180)
                return new double[] { latitude, longitude };
        }
        throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
                List.of(new ErrorField("near", "near는 '위도,경도' 형식이어야 합니다. 예: 37.5547,126.9707")));
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
