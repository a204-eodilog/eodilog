package com.eodilog.timeline;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

// 날짜 미정도 명시적인 커서 키로 담아 미정 여행 묶음 안에서 페이지를 이어간다.
public record TimelineCursor(LocalDate date, UUID tripId) {
	// PostgreSQL 17 date 범위. BC 4713년은 Java의 proleptic year -4712에 해당한다.
	private static final LocalDate MIN_DATE = LocalDate.of(-4712, 1, 1);
	private static final LocalDate MAX_DATE = LocalDate.of(5874897, 12, 31);

	public String encode() {
		String raw = (date == null ? "UNKNOWN" : date.toString()) + "|" + tripId;
		return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
	}

	public static TimelineCursor decode(String cursor) {
		try {
			String[] keys = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8).split("\\|", -1);
			if (keys.length != 2) throw new IllegalArgumentException();
			LocalDate date = keys[0].equals("UNKNOWN") ? null : LocalDate.parse(keys[0]);
			if (date != null && (date.isBefore(MIN_DATE) || date.isAfter(MAX_DATE))) throw new IllegalArgumentException();
			UUID id = UUID.fromString(keys[1]);
			if (!id.toString().equals(keys[1])) throw new IllegalArgumentException();
			TimelineCursor result = new TimelineCursor(date, id);
			if (!result.encode().equals(cursor)) throw new IllegalArgumentException();
			return result;
		} catch (RuntimeException ex) {
			throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
					List.of(new ErrorField("cursor", "올바르지 않은 타임라인 커서입니다.")));
		}
	}
}
