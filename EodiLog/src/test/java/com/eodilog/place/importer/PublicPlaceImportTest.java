package com.eodilog.place.importer;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.*;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;

class PublicPlaceImportTest {
    @Test void csvHandlesQuotedNamesAndImportsAllRows() throws Exception {
        var writer = mock(PublicPlaceWriter.class);
        when(writer.upsert(anyList())).thenAnswer(call -> ((java.util.List<?>) call.getArgument(0)).size());
        String input = "상가업소번호,상호명,도로명주소,위도,경도,법정동코드\n"
                + "1,\"카페, 바다\",부산,35.1000,129.1000,2611000000\n"
                + "2,\"두 줄\n카페\",강릉,37.7000,128.9000,4215000000\n";
        long count = new SbdcPlaceImporter(writer).importCsv(new ByteArrayInputStream(input.getBytes(StandardCharsets.UTF_8)), StandardCharsets.UTF_8);
        assertThat(count).isEqualTo(2);
        verify(writer).upsert(argThat(rows -> rows.size() == 2 && rows.getFirst().name().equals("카페, 바다")
                && rows.getLast().name().equals("두 줄\n카페")));
    }

    // 업종 대>중>소분류를 날씨 대안 실내 판단용 category로 남긴다. 분류 열이 없는 파일은 null
    @Test void csvKeepsBusinessCategory() throws Exception {
        var writer = mock(PublicPlaceWriter.class);
        when(writer.upsert(anyList())).thenAnswer(call -> ((java.util.List<?>) call.getArgument(0)).size());
        String input = "상가업소번호,상호명,상권업종대분류명,상권업종중분류명,상권업종소분류명,도로명주소,위도,경도,법정동코드\n"
                + "1,바다 카페,음식,커피점/카페,카페,부산,35.1000,129.1000,2611000000\n"
                + "2,이름만,,,,부산,35.1000,129.1000,2611000000\n";
        new SbdcPlaceImporter(writer).importCsv(new ByteArrayInputStream(input.getBytes(StandardCharsets.UTF_8)), StandardCharsets.UTF_8);
        verify(writer).upsert(argThat(rows -> rows.size() == 2
                && "음식>커피점/카페>카페".equals(rows.getFirst().category()) && rows.getLast().category() == null));
    }

    @Test void ktoKeepsContentTypeAsCategory() {
        var importer = new KtoPlaceImporter(mock(PublicPlaceWriter.class), JsonMapper.builder().build(), mock(RestClient.class));
        var page = importer.parsePage("""
                {"response":{"header":{"resultCode":"0000"},"body":{"totalCount":2,"items":{"item":[
                {"contentid":"1","contenttypeid":"14","title":"박물관","addr1":"부산","mapx":"129.1","mapy":"35.1"},
                {"contentid":"2","contenttypeid":"99","title":"모름","addr1":"부산","mapx":"129.1","mapy":"35.1"}
                ]}}}}
                """);
        assertThat(page.rows()).extracting(PublicPlaceRow::category).containsExactly("문화시설", null);
    }

    @Test void ktoParsesNationwidePageAndRejectsApiErrors() {
        var importer = new KtoPlaceImporter(mock(PublicPlaceWriter.class), JsonMapper.builder().build(), mock(RestClient.class));
        String json = """
                {"response":{"header":{"resultCode":"0000"},"body":{"totalCount":1,"items":{"item":[
                {"contentid":"123","title":"전국 명소","addr1":"부산","mapx":"129.1","mapy":"35.1","lDongRegnCd":"26","lDongSignguCd":"110"}
                ]}}}}
                """;
        var page = importer.parsePage(json);
        assertThat(page.totalCount()).isOne();
        assertThat(page.rows()).hasSize(1);
        assertThat(page.rows().getFirst().regionCode()).isEqualTo("2611000000");
        assertThatThrownBy(() -> importer.parsePage("{\"response\":{\"header\":{\"resultCode\":\"99\"}}}"))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test void ktoEncodedKeyIsNotEncodedTwice() {
        assertThat(KtoPlaceImporter.requestUri("abc%2Bdef%2Fghi%3D", 1).toString())
                .contains("serviceKey=abc%2Bdef%2Fghi%3D")
                .doesNotContain("%252B");
        assertThat(KtoPlaceImporter.requestUri("abc+def/ghi=", 1).toString())
                .contains("serviceKey=abc%2Bdef%2Fghi%3D");
    }

    // 수입이 끝나면 통계를 새로 만든다. 통계가 없으면 장소 검색이 느린 계획을 고른다(EODI-300)
    @Test void runnerRefreshesPlaceStatisticsAfterImport() throws Exception {
        var sbdc = mock(SbdcPlaceImporter.class);
        var kto = mock(KtoPlaceImporter.class);
        var jdbc = mock(JdbcTemplate.class);
        var runner = new PublicPlaceImportRunner(sbdc, kto, mock(PublicToiletImporter.class), jdbc);
        ReflectionTestUtils.setField(runner, "sbdcPath", "");
        ReflectionTestUtils.setField(runner, "ktoKey", "key");
        ReflectionTestUtils.setField(runner, "ktoStartPage", 1);
        runner.run(null);
        var order = inOrder(kto, jdbc);
        order.verify(kto).importAll("key", 1);
        order.verify(jdbc).execute("ANALYZE places");
    }

    // 화장실만 넣을 때는 화장실 통계만 새로 만든다(EODI-304)
    @Test void runnerImportsToiletsOnly() throws Exception {
        var toilets = mock(PublicToiletImporter.class);
        var jdbc = mock(JdbcTemplate.class);
        var runner = new PublicPlaceImportRunner(mock(SbdcPlaceImporter.class), mock(KtoPlaceImporter.class), toilets, jdbc);
        ReflectionTestUtils.setField(runner, "toiletPath", "toilets.csv");
        ReflectionTestUtils.setField(runner, "toiletCharset", "UTF-8");
        runner.run(null);
        verify(toilets).importPath(java.nio.file.Path.of("toilets.csv"), StandardCharsets.UTF_8);
        verify(jdbc).execute("ANALYZE public_toilets");
        verify(jdbc, never()).execute("ANALYZE places");
    }
}
