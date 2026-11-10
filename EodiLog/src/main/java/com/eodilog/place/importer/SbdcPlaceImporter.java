package com.eodilog.place.importer;

import java.io.*;
import java.math.BigDecimal;
import java.nio.charset.Charset;
import java.nio.file.*;
import java.util.*;
import java.util.zip.ZipFile;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/** Imports every CSV in a nationwide SBDC download, without loading the file into memory. */
@Service
public class SbdcPlaceImporter {
    private static final Logger log = LoggerFactory.getLogger(SbdcPlaceImporter.class);
    private final PublicPlaceWriter writer;
    public SbdcPlaceImporter(PublicPlaceWriter writer) { this.writer = writer; }

    public long importPath(Path path, Charset charset) throws IOException {
        if (Files.isDirectory(path)) {
            long total = 0;
            try (var paths = Files.walk(path)) {
                for (var file : paths.filter(p -> Files.isRegularFile(p) && p.toString().toLowerCase(Locale.ROOT).endsWith(".csv")).sorted().toList()) {
                    long count = importCsv(Files.newInputStream(file), charset);
                    total += count;
                    log.info("SBDC file {} processed {} valid places (total {})", file.getFileName(), count, total);
                }
            }
            if (total == 0) throw new IOException("No valid SBDC places in directory: " + path);
            return total;
        }
        if (path.toString().toLowerCase(Locale.ROOT).endsWith(".zip")) {
            long total = 0;
            try (var zip = new ZipFile(path.toFile(), charset)) {
                var entries = zip.entries();
                while (entries.hasMoreElements()) {
                    var entry = entries.nextElement();
                    if (!entry.isDirectory() && entry.getName().toLowerCase(Locale.ROOT).endsWith(".csv"))
                        total += importCsv(zip.getInputStream(entry), charset);
                }
            }
            if (total == 0) throw new IOException("No valid SBDC places in ZIP: " + path);
            return total;
        }
        long total = importCsv(Files.newInputStream(path), charset);
        if (total == 0) throw new IOException("No valid SBDC places in CSV: " + path);
        return total;
    }

    long importCsv(InputStream source, Charset charset) throws IOException {
        try (var csv = new CsvRecords(new BufferedReader(new InputStreamReader(source, charset)))) {
            var header = csv.next();
            if (header == null) return 0;
            var columns = new HashMap<String, Integer>();
            for (int i = 0; i < header.size(); i++) columns.put(header.get(i).replace("\uFEFF", "").strip(), i);
            for (var required : List.of("상가업소번호", "상호명", "위도", "경도"))
                if (!columns.containsKey(required)) throw new IOException("Missing SBDC CSV column: " + required);
            var batch = new ArrayList<PublicPlaceRow>(500);
            long total = 0;
            for (List<String> record; (record = csv.next()) != null;) {
                try {
                    var row = new PublicPlaceRow("SBDC", field(record, columns, "상가업소번호"), field(record, columns, "상호명"),
                            first(field(record, columns, "도로명주소"), field(record, columns, "지번주소")),
                            new BigDecimal(field(record, columns, "위도")), new BigDecimal(field(record, columns, "경도")),
                            field(record, columns, "법정동코드"), category(record, columns));
                    if (row.valid()) batch.add(row);
                } catch (NumberFormatException ignored) { /* A source row without coordinates cannot become a pin. */ }
                if (batch.size() == 500) { total += writer.upsert(batch); batch.clear(); }
            }
            total += writer.upsert(batch);
            return total;
        }
    }

    private static String field(List<String> row, Map<String, Integer> columns, String key) {
        Integer index = columns.get(key);
        return index == null || index >= row.size() ? null : row.get(index).strip();
    }
    // 업종 대>중>소분류 이름. 열이 없거나 비면 그 단계는 건너뛴다
    private static String category(List<String> row, Map<String, Integer> columns) {
        var parts = new ArrayList<String>();
        for (var key : List.of("상권업종대분류명", "상권업종중분류명", "상권업종소분류명")) {
            String value = field(row, columns, key);
            if (value != null && !value.isBlank()) parts.add(value);
        }
        return parts.isEmpty() ? null : String.join(">", parts);
    }
    private static String first(String a, String b) { return a != null && !a.isBlank() ? a : b; }
}
