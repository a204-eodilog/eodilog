package com.eodilog.region.service;

import java.util.*;
import com.eodilog.region.dto.RegionView;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class JdbcRegionCodeResolver implements RegionCodeResolver {
    private final NamedParameterJdbcTemplate jdbc;
    public JdbcRegionCodeResolver(NamedParameterJdbcTemplate jdbc) { this.jdbc = jdbc; }
    @Override
    @Transactional(readOnly = true)
    public Optional<RegionView> resolve(String code) {
        if (code == null || !code.matches("[0-9]{10}")) return Optional.empty();
        String sigungu = code.substring(0, 5) + "00000";
        return jdbc.query("SELECT " + JdbcRegionReader.COLUMNS + " FROM regions WHERE id=COALESCE("
                + "(SELECT region_id FROM region_code_aliases WHERE code=:code),"
                + "(SELECT region_id FROM region_code_targets WHERE code=:code))",
                Map.of("code", sigungu), JdbcRegionReader::map).stream().findFirst();
    }
}
