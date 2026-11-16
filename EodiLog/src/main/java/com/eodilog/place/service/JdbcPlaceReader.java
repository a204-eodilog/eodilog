package com.eodilog.place.service;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.*;
import com.eodilog.place.domain.PlaceSource;
import com.eodilog.place.dto.PlaceView;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class JdbcPlaceReader implements PlaceReader {

	static final String COLUMNS = "id,name,address,latitude,longitude,region_id,provider,provider_place_id,source,category,image_url";

	private final NamedParameterJdbcTemplate jdbc;

	public JdbcPlaceReader(NamedParameterJdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	@Transactional(readOnly = true)
	public Optional<PlaceView> find(UUID placeId) {
		return Optional.ofNullable(findAll(List.of(placeId)).get(placeId));
	}

	@Override
	@Transactional(readOnly = true)
	public Map<UUID, PlaceView> findAll(Collection<UUID> placeIds) {
		if (placeIds.isEmpty()) {
			return Map.of();
		}
		Set<UUID> ids = new LinkedHashSet<>(placeIds);
		Map<UUID, PlaceView> result = new LinkedHashMap<>();
		jdbc.query("SELECT " + COLUMNS + " FROM places WHERE id IN (:ids)", Map.of("ids", ids), JdbcPlaceReader::map)
				.forEach(place -> result.put(place.id(), place));
		return result;
	}

	static PlaceView map(ResultSet rs, int row) throws SQLException {
		return new PlaceView(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("address"),
				rs.getBigDecimal("latitude"), rs.getBigDecimal("longitude"), rs.getObject("region_id", UUID.class),
				rs.getString("provider"), rs.getString("provider_place_id"), PlaceSource.valueOf(rs.getString("source")),
				rs.getString("category"), rs.getString("image_url"));
	}
}
