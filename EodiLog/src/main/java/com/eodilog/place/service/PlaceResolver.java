package com.eodilog.place.service;

import java.sql.Timestamp;
import java.time.Clock;
import com.eodilog.global.id.UuidV7;
import com.eodilog.place.dto.PlaceView;
import com.eodilog.place.provider.ProviderPlace;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 공급자 결과를 로컬 장소로 바꾼다. 같은 공급자 ID는 한 행으로 모으고 이름·주소·좌표·지역을 최신 값으로 갱신한다.
 */
@Service
public class PlaceResolver {

	// 동시에 같은 공급자 장소를 저장해도 ON CONFLICT가 한 행으로 모은다.
	// 모르는 지역 코드는 새 장소면 null, 기존 장소면 이전 지역을 유지한다(일시적인 지역 변환 실패로 지우지 않는다)
	private static final String UPSERT = "INSERT INTO places (id,region_id,name,address,latitude,longitude,provider,provider_place_id,source,created_at,updated_at) "
			+ "VALUES (:id,(SELECT id FROM regions WHERE code = :regionCode),:name,:address,:latitude,:longitude,:provider,:providerPlaceId,'PROVIDER',:now,:now) "
			+ "ON CONFLICT (provider, provider_place_id) DO UPDATE SET region_id = COALESCE(EXCLUDED.region_id, places.region_id), name = EXCLUDED.name, "
			+ "address = EXCLUDED.address, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, updated_at = EXCLUDED.updated_at "
			+ "RETURNING " + JdbcPlaceReader.COLUMNS;

	private final NamedParameterJdbcTemplate jdbc;
	private final Clock clock;

	public PlaceResolver(NamedParameterJdbcTemplate jdbc, Clock clock) {
		this.jdbc = jdbc;
		this.clock = clock;
	}

	@Transactional
	public PlaceView resolve(String provider, ProviderPlace place) {
		var params = new MapSqlParameterSource()
				.addValue("id", UuidV7.generate())
				.addValue("regionCode", place.regionCode())
				.addValue("name", place.name())
				.addValue("address", place.address())
				.addValue("latitude", place.latitude())
				.addValue("longitude", place.longitude())
				.addValue("provider", provider)
				.addValue("providerPlaceId", place.providerPlaceId())
				.addValue("now", Timestamp.from(clock.instant()));
		return jdbc.queryForObject(UPSERT, params, JdbcPlaceReader::map);
	}
}
