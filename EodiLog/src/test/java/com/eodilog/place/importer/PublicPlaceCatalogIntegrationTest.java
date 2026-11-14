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
        var saved = catalog.search("전국카페", null, null, null, 20).data();
        assertThat(saved).hasSize(1);
        UUID id = saved.getFirst().id();
        writer.upsert(List.of(new PublicPlaceRow("SBDC", externalId, "전국카페 수정", "부산", new BigDecimal("35.1"), new BigDecimal("129.1"), "2611000000")));
        assertThat(catalog.search("전국카페 수정", null, null, null, 20).data()).extracting(p -> p.id()).containsExactly(id);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM places WHERE provider='SBDC' AND provider_place_id=?", Integer.class, externalId)).isOne();
        // 분류는 새 값이 있을 때만 바꾸고, 분류 없는 재수집이 기존 분류를 지우지 않는다
        writer.upsert(List.of(new PublicPlaceRow("SBDC", externalId, "전국카페 수정", "부산", new BigDecimal("35.1"), new BigDecimal("129.1"), "2611000000", "음식>커피점/카페>카페")));
        writer.upsert(List.of(new PublicPlaceRow("SBDC", externalId, "전국카페 수정", "부산", new BigDecimal("35.1"), new BigDecimal("129.1"), "2611000000")));
        assertThat(jdbc.queryForObject("SELECT category FROM places WHERE id=?", String.class, id)).isEqualTo("음식>커피점/카페>카페");
        // 대표 사진도 같다. http 원본 주소는 https로 저장하고(앱이 평문 http 그림을 막는다), 사진 없는 재수집이 지우지 않는다
        writer.upsert(List.of(new PublicPlaceRow("SBDC", externalId, "전국카페 수정", "부산", new BigDecimal("35.1"), new BigDecimal("129.1"), "2611000000", null, "http://tong.visitkorea.or.kr/cms/resource/1.jpg")));
        writer.upsert(List.of(new PublicPlaceRow("SBDC", externalId, "전국카페 수정", "부산", new BigDecimal("35.1"), new BigDecimal("129.1"), "2611000000")));
        assertThat(jdbc.queryForObject("SELECT image_url FROM places WHERE id=?", String.class, id)).isEqualTo("https://tong.visitkorea.or.kr/cms/resource/1.jpg");
        assertThat(catalog.detail(id).imageUrl()).isEqualTo("https://tong.visitkorea.or.kr/cms/resource/1.jpg");

        var manual = catalog.createManual("지도에 없는 장소", null, new BigDecimal("37.5"), new BigDecimal("127.0"), null);
        assertThat(catalog.search("지도에 없는", null, null, null, 20).data()).extracting(p -> p.id()).contains(manual.id());
        assertThat(catalog.detail(manual.id()).source().name()).isEqualTo("MANUAL");
    }
}
