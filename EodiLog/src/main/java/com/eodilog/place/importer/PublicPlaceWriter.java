package com.eodilog.place.importer;

import com.eodilog.global.id.UuidV7;
import java.sql.Timestamp;
import java.time.Clock;
import java.util.List;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PublicPlaceWriter {
    private static final String UPSERT = """
            INSERT INTO places(id,region_id,name,address,latitude,longitude,provider,provider_place_id,source,category,image_url,created_at,updated_at)
            VALUES(:id,COALESCE(
                   (SELECT region_id FROM region_code_aliases WHERE code=left(:regionCode,5)||'00000'),
                   (SELECT region_id FROM region_code_targets WHERE code=left(:regionCode,5)||'00000')),
                   :name,:address,:latitude,:longitude,:provider,:externalId,'PROVIDER',:category,:imageUrl,:now,:now)
            ON CONFLICT(provider,provider_place_id) DO UPDATE SET
                region_id=COALESCE(EXCLUDED.region_id,places.region_id),
                name=EXCLUDED.name,address=EXCLUDED.address,
                latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,
                category=COALESCE(EXCLUDED.category,places.category),
                image_url=COALESCE(EXCLUDED.image_url,places.image_url),updated_at=EXCLUDED.updated_at
            WHERE places.name IS DISTINCT FROM EXCLUDED.name
               OR places.address IS DISTINCT FROM EXCLUDED.address
               OR places.latitude IS DISTINCT FROM EXCLUDED.latitude
               OR places.longitude IS DISTINCT FROM EXCLUDED.longitude
               OR (EXCLUDED.region_id IS NOT NULL AND places.region_id IS DISTINCT FROM EXCLUDED.region_id)
               OR (EXCLUDED.category IS NOT NULL AND places.category IS DISTINCT FROM EXCLUDED.category)
               OR (EXCLUDED.image_url IS NOT NULL AND places.image_url IS DISTINCT FROM EXCLUDED.image_url)
            """;
    private final NamedParameterJdbcTemplate jdbc;
    private final Clock clock;

    public PublicPlaceWriter(NamedParameterJdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Transactional
    public int upsert(List<PublicPlaceRow> places) {
        var now = Timestamp.from(clock.instant());
        var unique = new java.util.LinkedHashMap<String, PublicPlaceRow>();
        places.stream().filter(PublicPlaceRow::valid).forEach(row -> unique.put(row.provider() + "\u0000" + row.externalId(), row));
        var args = unique.values().stream().map(row -> new MapSqlParameterSource()
                .addValue("id", UuidV7.generate())
                .addValue("regionCode", row.regionCode() != null && row.regionCode().matches("[0-9]{10}")
                        ? row.regionCode() : null)
                .addValue("name", row.name().strip())
                .addValue("address", row.address())
                .addValue("latitude", row.latitude())
                .addValue("longitude", row.longitude())
                .addValue("provider", row.provider())
                .addValue("externalId", row.externalId())
                .addValue("category", row.normalizedCategory())
                .addValue("imageUrl", row.normalizedImageUrl())
                .addValue("now", now)).toArray(MapSqlParameterSource[]::new);
        if (args.length == 0) return 0;
        jdbc.batchUpdate(UPSERT, args);
        return args.length;
    }
}
