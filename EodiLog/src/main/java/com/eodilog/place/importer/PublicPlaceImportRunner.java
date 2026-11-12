package com.eodilog.place.importer;

import java.nio.charset.Charset;
import java.nio.file.Path;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Explicit one-shot operator command. Never runs during a normal server startup. */
@Component
@ConditionalOnProperty(name = "app.place-import.enabled", havingValue = "true")
public class PublicPlaceImportRunner implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(PublicPlaceImportRunner.class);
    private final SbdcPlaceImporter sbdc;
    private final KtoPlaceImporter kto;
    private final PublicToiletImporter toilets;
    private final JdbcTemplate jdbc;
    @Value("${app.place-import.sbdc-path:}") private String sbdcPath;
    @Value("${app.place-import.sbdc-charset:UTF-8}") private String charset;
    @Value("${app.place-import.kto-key:}") private String ktoKey;
    @Value("${app.place-import.kto-start-page:1}") private int ktoStartPage;
    // 공중화장실 표준데이터 CSV(EODI-304). data.go.kr 파일은 보통 EUC-KR이다
    @Value("${app.place-import.toilet-path:}") private String toiletPath;
    @Value("${app.place-import.toilet-charset:MS949}") private String toiletCharset;
    public PublicPlaceImportRunner(SbdcPlaceImporter sbdc, KtoPlaceImporter kto, PublicToiletImporter toilets, JdbcTemplate jdbc) {
        this.sbdc = sbdc; this.kto = kto; this.toilets = toilets; this.jdbc = jdbc;
    }

    @Override public void run(ApplicationArguments args) throws Exception {
        boolean places = !blank(sbdcPath) || !blank(ktoKey);
        if (!places && blank(toiletPath)) throw new IllegalArgumentException("Set SBDC path, KTO key and/or toilet path");
        if (!blank(sbdcPath)) log.info("SBDC import processed {} valid places", sbdc.importPath(Path.of(sbdcPath), Charset.forName(charset)));
        if (!blank(ktoKey)) log.info("KTO import processed {} valid places", kto.importAll(ktoKey, ktoStartPage));
        if (!blank(toiletPath)) {
            log.info("Toilet import processed {} valid rows", toilets.importPath(Path.of(toiletPath), Charset.forName(toiletCharset)));
            jdbc.execute("ANALYZE public_toilets");
        }
        // 많이 넣은 뒤에는 통계를 새로 만든다. 자동 통계는 늦게 돌 수 있고, 그 사이 장소 검색이 느린 계획을 고를 수 있다(EODI-288·-300)
        if (places) {
            jdbc.execute("ANALYZE places");
            log.info("Refreshed places statistics");
        }
    }

    private static boolean blank(String value) { return value == null || value.isBlank(); }
}
