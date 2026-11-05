package com.eodilog.place.importer;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.*;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
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
}
