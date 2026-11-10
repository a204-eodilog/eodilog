package com.eodilog.weather.alternative;

import com.eodilog.place.dto.PlaceView;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

// 날씨 대안 후보 장소(정책 W-15). 이름·좌표·분류는 우리 DB 값만 쓴다. AI는 이 목록 밖의 장소를 낼 수 없다
// ① 여행 저장 장소(동행이 고른 곳) ② 한국관광공사(KTO) 관광정보 장소. 둘 다 대상 반경 안·분류 있음·그날 코스 제외
// 상가(SBDC)는 실내 후보로 맞지 않는 업종(세탁소 등)이 많아 넣지 않는다
@Component
@RequiredArgsConstructor
public class AlternativePoolReader {

	static final int RADIUS_METERS = 2000;
	static final int MAX_CANDIDATES = 30;
	// idx_places_location 식과 같아야 인덱스를 탄다
	private static final String LOCATION = "ST_SetSRID(ST_MakePoint(p.longitude::double precision, "
			+ "p.latitude::double precision), 4326)::geography";

	private final NamedParameterJdbcTemplate jdbc;

	public List<UUID> find(UUID tripId, PlaceView target, Set<UUID> excludedPlaceIds) {
		MapSqlParameterSource params = new MapSqlParameterSource()
				.addValue("tripId", tripId)
				.addValue("longitude", target.longitude().doubleValue())
				.addValue("latitude", target.latitude().doubleValue())
				.addValue("radius", RADIUS_METERS)
				.addValue("excluded", excludedPlaceIds)
				.addValue("limit", MAX_CANDIDATES);
		return jdbc.queryForList("""
				with target as (select ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography as g),
				     saved as (select distinct place_id from trip_place_saves where trip_id = :tripId)
				select p.id
				from places p cross join target t
				where p.category is not null
				  and ST_DWithin(%1$s, t.g, :radius)
				  and (p.provider = 'KTO' or p.id in (select place_id from saved))
				  and p.id not in (:excluded)
				order by (p.id in (select place_id from saved)) desc, ST_Distance(%1$s, t.g), p.id
				limit :limit""".formatted(LOCATION), params, UUID.class);
	}

	public Map<UUID, String> categories(Collection<UUID> placeIds) {
		Map<UUID, String> result = new HashMap<>();
		if (placeIds.isEmpty()) {
			return result;
		}
		jdbc.query("select id, category from places where id in (:ids) and category is not null",
				Map.of("ids", placeIds),
				rs -> {
					result.put(rs.getObject("id", UUID.class), rs.getString("category"));
				});
		return result;
	}

}
