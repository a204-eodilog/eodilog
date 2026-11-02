package com.eodilog.region.service;

import java.sql.*;
import java.util.*;
import com.eodilog.region.dto.RegionView;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
@Transactional(readOnly = true)
public class JdbcRegionReader implements RegionReader {
    static final String COLUMNS = "id,code,name,parent_id,latitude,longitude";
    private final NamedParameterJdbcTemplate jdbc;
    public JdbcRegionReader(NamedParameterJdbcTemplate jdbc) { this.jdbc = jdbc; }
    public Optional<RegionView> find(UUID id) { return Optional.ofNullable(findAll(List.of(id)).get(id)); }
    public Map<UUID, RegionView> findAll(Collection<UUID> regionIds) {
        if (regionIds.isEmpty()) return Map.of();
        var result = new LinkedHashMap<UUID, RegionView>();
        jdbc.query("SELECT " + COLUMNS + " FROM regions WHERE id IN (:ids)",
                Map.of("ids", new LinkedHashSet<>(regionIds)), JdbcRegionReader::map)
                .forEach(region -> result.put(region.id(), region));
        return result;
    }
    static RegionView map(ResultSet rs, int row) throws SQLException {
        return new RegionView(rs.getObject("id", UUID.class), rs.getString("code"), rs.getString("name"),
                rs.getObject("parent_id", UUID.class), rs.getBigDecimal("latitude"), rs.getBigDecimal("longitude"));
    }
}
