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
    private final PlaceSearchReader searchReader;
    private final Clock clock;
    public PlaceCatalogService(NamedParameterJdbcTemplate jdbc, PlaceReader reader, PlaceSearchReader searchReader, Clock clock) {
        this.jdbc = jdbc; this.reader = reader; this.searchReader = searchReader; this.clock = clock;
    }

    private static final Pattern NEAR = Pattern.compile("(-?\\d{1,3}(?:\\.\\d{1,10})?)\\s*,\\s*(-?\\d{1,3}(?:\\.\\d{1,10})?)");

    /**
     * 이름 부분 일치 검색. near(위도,경도)가 있으면 이름 완전 일치(가까운 순) → 반경 30km 안(가까운 순) → 반경 밖(id 순),
     * 없으면 완전 일치(id 순) → 앞부분 일치(이름순) → 그 밖의 포함(id 순)이다. 일치 비교는 대소문자와 앞뒤 공백을 무시한다.
     * 조회 방법은 {@link PlaceSearchReader}가 단계별로 고른다.
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
        var search = new PlaceSearchReader.Search(normalized, point == null ? null : point[0], point == null ? null : point[1], regionId);
        var hits = searchReader.read(search, after, limit + 1);
        boolean hasNext = hits.size() > limit;
        var page = hits.subList(0, Math.min(hits.size(), limit));
        String next = null;
        if (hasNext) {
            var last = page.getLast();
            next = new PlaceSearchCursor(binding, last.tier(), point == null ? null : last.distance(),
                    point == null && last.tier() == 1 ? last.nameKey() : null, last.place().id()).encode();
        }
        return PageResponse.of(page.stream().map(PlaceSearchReader.Hit::place).toList(), next, hasNext);
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
