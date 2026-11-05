package com.eodilog.place.importer;

import java.nio.charset.Charset;
import java.nio.file.Path;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Explicit one-shot operator command. Never runs during a normal server startup. */
@Component
@ConditionalOnProperty(name = "app.place-import.enabled", havingValue = "true")
public class PublicPlaceImportRunner implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(PublicPlaceImportRunner.class);
    private final SbdcPlaceImporter sbdc;
    private final KtoPlaceImporter kto;
    @Value("${app.place-import.sbdc-path:}") private String sbdcPath;
    @Value("${app.place-import.sbdc-charset:UTF-8}") private String charset;
    @Value("${app.place-import.kto-key:}") private String ktoKey;
    @Value("${app.place-import.kto-start-page:1}") private int ktoStartPage;
    public PublicPlaceImportRunner(SbdcPlaceImporter sbdc, KtoPlaceImporter kto) { this.sbdc = sbdc; this.kto = kto; }

    @Override public void run(ApplicationArguments args) throws Exception {
        if (sbdcPath.isBlank() && ktoKey.isBlank()) throw new IllegalArgumentException("Set SBDC path and/or KTO key");
        if (!sbdcPath.isBlank()) log.info("SBDC import processed {} valid places", sbdc.importPath(Path.of(sbdcPath), Charset.forName(charset)));
        if (!ktoKey.isBlank()) log.info("KTO import processed {} valid places", kto.importAll(ktoKey, ktoStartPage));
    }
}
