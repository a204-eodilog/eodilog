package com.eodilog.region.service;

import java.nio.charset.StandardCharsets;
import java.util.*;
import com.eodilog.global.common.error.*;

/** Query-bound ascending code/UUID cursor; regions have no created_at column. */
record RegionCursor(String query, String code, UUID id) {
    String encode() {
        String q = Base64.getUrlEncoder().withoutPadding().encodeToString(query.getBytes(StandardCharsets.UTF_8));
        String c = Base64.getUrlEncoder().withoutPadding().encodeToString(code.getBytes(StandardCharsets.UTF_8));
        return Base64.getUrlEncoder().withoutPadding().encodeToString((q + "|" + c + "|" + id).getBytes(StandardCharsets.UTF_8));
    }
    static RegionCursor decode(String value, String query) {
        try {
            if (value.length() > 4096 || !value.matches("[A-Za-z0-9_-]+")) throw new IllegalArgumentException();
            String[] parts = new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8).split("\\|", -1);
            if (parts.length != 3) throw new IllegalArgumentException();
            String code = new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8);
            if (code.isEmpty() || code.length() > 100 || code.indexOf('\0') >= 0) throw new IllegalArgumentException();
            var cursor = new RegionCursor(new String(Base64.getUrlDecoder().decode(parts[0]), StandardCharsets.UTF_8), code, UUID.fromString(parts[2]));
            if (!query.equals(cursor.query()) || !cursor.encode().equals(value)) throw new IllegalArgumentException();
            return cursor;
        } catch (RuntimeException ex) { throw new BusinessException(CommonErrorCode.VALIDATION_ERROR); }
    }
}
