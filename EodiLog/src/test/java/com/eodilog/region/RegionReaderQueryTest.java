package com.eodilog.region;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import java.util.*;
import com.eodilog.region.service.JdbcRegionReader;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

class RegionReaderQueryTest {
    @Test void emptyInputDoesNotQueryAndBatchDeduplicatesInOneInQuery() {
        var jdbc = mock(NamedParameterJdbcTemplate.class);
        var reader = new JdbcRegionReader(jdbc);
        assertThat(reader.findAll(List.of())).isEmpty();
        verifyNoInteractions(jdbc);
        UUID a=UUID.randomUUID(), b=UUID.randomUUID();
        reader.findAll(List.of(a,b,a));
        verify(jdbc).query(eq("SELECT id,code,name,parent_id,latitude,longitude FROM regions WHERE id IN (:ids)"), eq(Map.of("ids",new LinkedHashSet<>(List.of(a,b)))), any(RowMapper.class));
        verifyNoMoreInteractions(jdbc);
    }
}
