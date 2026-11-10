package com.eodilog.trend;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;

// 순위 목록 커서. 정렬 키(publishedTripCount DESC, region.code ASC)의 마지막 값을 담는다
public record TrendCursor(int count, String code) {

    public String encode() {
        String raw = count + "|" + code;
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }

    public static TrendCursor decode(String cursor) {
        try {
            String[] keys = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8).split("\\|", 2);
            if (keys.length != 2 || keys[1].isEmpty()) throw new IllegalArgumentException();
            TrendCursor result = new TrendCursor(Integer.parseInt(keys[0]), keys[1]);
            if (result.count < 1 || !result.encode().equals(cursor)) throw new IllegalArgumentException();
            return result;
        } catch (RuntimeException ex) {
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
                    List.of(new ErrorField("cursor", "올바르지 않은 커서입니다. 처음부터 다시 조회해 주세요.")));
        }
    }

}
