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
    private final JdbcTemplate jdbc;
    @Value("${app.place-import.sbdc-path:}") private String sbdcPath;
    @Value("${app.place-import.sbdc-charset:UTF-8}") private String charset;
    @Value("${app.place-import.kto-key:}") private String ktoKey;
    @Value("${app.place-import.kto-start-page:1}") private int ktoStartPage;
    public PublicPlaceImportRunner(SbdcPlaceImporter sbdc, KtoPlaceImporter kto, JdbcTemplate jdbc) {
        this.sbdc = sbdc; this.kto = kto; this.jdbc = jdbc;
    }

    @Override public void run(ApplicationArguments args) throws Exception {
        if (sbdcPath.isBlank() && ktoKey.isBlank()) throw new IllegalArgumentException("Set SBDC path and/or KTO key");
        if (!sbdcPath.isBlank()) log.info("SBDC import processed {} valid places", sbdc.importPath(Path.of(sbdcPath), Charset.forName(charset)));
        if (!ktoKey.isBlank()) log.info("KTO import processed {} valid places", kto.importAll(ktoKey, ktoStartPage));
        // 많이 넣은 뒤에는 통계를 새로 만든다. 자동 통계는 늦게 돌 수 있고, 그 사이 장소 검색이 느린 계획을 고를 수 있다(EODI-288·-300)
        jdbc.execute("ANALYZE places");
        log.info("Refreshed places statistics");
    }
}
