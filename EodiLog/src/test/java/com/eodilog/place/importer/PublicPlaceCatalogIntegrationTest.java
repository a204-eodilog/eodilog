package com.eodilog.place.importer;

import static org.assertj.core.api.Assertions.*;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.place.service.PlaceCatalogService;
import java.math.BigDecimal;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
class PublicPlaceCatalogIntegrationTest {
    @Autowired PublicPlaceWriter writer;
    @Autowired PlaceCatalogService catalog;
    @Autowired JdbcTemplate jdbc;

    @Test void importIsIdempotentAndSearchesNationalAndManualPlaces() {
        String externalId = UUID.randomUUID().toString();
        var first = new PublicPlaceRow("SBDC", externalId, "전국카페", "부산", new BigDecimal("35.1"), new BigDecimal("129.1"), "2611000000");
        writer.upsert(List.of(first));
        var saved = catalog.search("전국카페", null, null, 20).data();
        assertThat(saved).hasSize(1);
        UUID id = saved.getFirst().id();
        writer.upsert(List.of(new PublicPlaceRow("SBDC", externalId, "전국카페 수정", "부산", new BigDecimal("35.1"), new BigDecimal("129.1"), "2611000000")));
        assertThat(catalog.search("전국카페 수정", null, null, 20).data()).extracting(p -> p.id()).containsExactly(id);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM places WHERE provider='SBDC' AND provider_place_id=?", Integer.class, externalId)).isOne();

        var manual = catalog.createManual("지도에 없는 장소", null, new BigDecimal("37.5"), new BigDecimal("127.0"), null);
        assertThat(catalog.search("지도에 없는", null, null, 20).data()).extracting(p -> p.id()).contains(manual.id());
        assertThat(catalog.detail(manual.id()).source().name()).isEqualTo("MANUAL");
    }
}
