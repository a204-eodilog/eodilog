package com.eodilog.place.importer;

import java.math.BigDecimal;
import java.net.URI;
import java.net.URLDecoder;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Reads all pages of Tourism Data Lab's Korean tourism list, with no area filter. */
@Service
public class KtoPlaceImporter {
    private static final String ENDPOINT = "https://apis.data.go.kr/B551011/KorService2/areaBasedList2";
    private static final int PAGE_SIZE = 1000;
    private final PublicPlaceWriter writer;
    private final JsonMapper json;
    private final RestClient http;

    @org.springframework.beans.factory.annotation.Autowired
    public KtoPlaceImporter(PublicPlaceWriter writer, JsonMapper json) {
        this(writer, json, client());
    }
    KtoPlaceImporter(PublicPlaceWriter writer, JsonMapper json, RestClient http) {
        this.writer = writer; this.json = json; this.http = http;
    }
    private static RestClient client() {
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());
        factory.setReadTimeout(Duration.ofSeconds(30));
        return RestClient.builder().baseUrl(ENDPOINT).requestFactory(factory).build();
    }

    public long importAll(String serviceKey, int startPage) {
        if (serviceKey == null || serviceKey.isBlank() || startPage < 1) throw new IllegalArgumentException("KTO key and start page required");
        long total = 0;
        for (int page = startPage; ; page++) {
            int current = page;
            String body = http.get().uri(requestUri(serviceKey, current))
                    .retrieve().body(String.class);
            var parsed = parsePage(body);
            if (parsed.totalCount() > 0 && parsed.rows().isEmpty()) throw new IllegalStateException("KTO page " + page + " has no items");
            total += writer.upsert(parsed.rows());
            if ((long) page * PAGE_SIZE >= parsed.totalCount()) return total;
        }
    }

    static URI requestUri(String serviceKey, int page) {
        String decoded = serviceKey.matches(".*%[0-9A-Fa-f]{2}.*")
                ? URLDecoder.decode(serviceKey, StandardCharsets.UTF_8) : serviceKey;
        String encoded = java.net.URLEncoder.encode(decoded, StandardCharsets.UTF_8);
        return URI.create(ENDPOINT + "?serviceKey=" + encoded + "&MobileOS=ETC&MobileApp=EodiLog"
                + "&_type=json&numOfRows=" + PAGE_SIZE + "&pageNo=" + page);
    }

    Page parsePage(String body) {
        if (body == null || body.isBlank()) throw new IllegalStateException("Empty KTO response");
        JsonNode root = json.readTree(body);
        JsonNode header = root.path("response").path("header");
        if (!"0000".equals(header.path("resultCode").asText()))
            throw new IllegalStateException("KTO API error: " + header.path("resultCode").asText());
        JsonNode response = root.path("response").path("body");
        int totalCount = response.path("totalCount").asInt(-1);
        if (totalCount < 0) throw new IllegalStateException("Missing KTO totalCount");
        JsonNode items = response.path("items").path("item");
        var rows = new ArrayList<PublicPlaceRow>();
        if (items.isArray()) for (var item : items) add(rows, item);
        else if (items.isObject()) add(rows, items);
        return new Page(totalCount, rows);
    }
    private static void add(List<PublicPlaceRow> rows, JsonNode item) {
        try {
            var row = new PublicPlaceRow("KTO", value(item, "contentid"), value(item, "title"),
                    value(item, "addr1"), new BigDecimal(value(item, "mapy")), new BigDecimal(value(item, "mapx")),
                    regionCode(item), contentType(item), image(item));
            if (row.valid()) rows.add(row);
        } catch (NumberFormatException | NullPointerException ignored) { /* Some attractions have no mappable location. */ }
    }
    // 관광 타입 이름(한국관광공사 contentTypeId 표). 세부 분류 코드는 이름 표가 따로 필요해 이번에는 쓰지 않는다
    private static final Map<String, String> CONTENT_TYPES = Map.of("12", "관광지", "14", "문화시설", "15", "축제공연행사",
            "25", "여행코스", "28", "레포츠", "32", "숙박", "38", "쇼핑", "39", "음식점");
    private static String contentType(JsonNode item) {
        String type = value(item, "contenttypeid");
        return type == null ? null : CONTENT_TYPES.get(type);
    }
    // 대표 사진. firstimage(원본)가 없으면 firstimage2(썸네일). 둘 다 없으면 null
    private static String image(JsonNode item) {
        String first = value(item, "firstimage");
        return first != null && !first.isBlank() ? first : value(item, "firstimage2");
    }
    private static String value(JsonNode item, String key) {
        var node = item.path(key);
        return node.isMissingNode() || node.isNull() ? null : node.asText().strip();
    }
    private static String regionCode(JsonNode item) {
        String region = value(item, "lDongRegnCd");
        String district = value(item, "lDongSignguCd");
        if (region != null && region.matches("[0-9]{2}") && district != null && district.matches("[0-9]{3}"))
            return region + district + "00000";
        return district != null && district.matches("[0-9]{5}") ? district + "00000" : null;
    }
    record Page(int totalCount, List<PublicPlaceRow> rows) {}
}
