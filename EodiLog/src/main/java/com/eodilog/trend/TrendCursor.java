package com.eodilog.trend;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.Base64;
import java.util.List;

// 순위 목록 커서. 조회 기간(from·to)과 정렬 키(publishedTripCount DESC, region.code ASC)의 마지막 값을 담는다.
// 다른 기간으로 조회하면 순위가 달라지므로 기간이 다른 커서는 거절한다
public record TrendCursor(LocalDate from, LocalDate to, int count, String code) {

    public String encode() {
        String raw = from + "|" + to + "|" + count + "|" + code;
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }

    /** Decodes a cursor issued for exactly the window [from,to]; anything else is 400 VALIDATION_ERROR on {@code cursor}. */
    public static TrendCursor decode(String cursor, LocalDate from, LocalDate to) {
        try {
            String[] keys = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8).split("\\|", 4);
            if (keys.length != 4 || keys[3].isEmpty()) throw new IllegalArgumentException();
            TrendCursor result = new TrendCursor(LocalDate.parse(keys[0]), LocalDate.parse(keys[1]), Integer.parseInt(keys[2]), keys[3]);
            if (result.count < 1 || !result.encode().equals(cursor)) throw new IllegalArgumentException();
            if (!result.from.equals(from) || !result.to.equals(to)) throw new IllegalArgumentException();
            return result;
        } catch (RuntimeException ex) {
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
                    List.of(new ErrorField("cursor", "올바르지 않은 커서입니다. 처음부터 다시 조회해 주세요.")));
        }
    }

}
