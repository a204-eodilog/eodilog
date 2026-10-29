package com.eodilog.trip.service;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

// 여행 목록 커서. 정렬 키(createdAt DESC, id DESC)를 담아 다음 페이지를 이어서 조회한다(명세 §2)
record TripCursor(Instant createdAt, UUID id) {

	private static final String SEPARATOR = "|";

	String encode() {
		String raw = createdAt + SEPARATOR + id;
		return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
	}

	static TripCursor decode(String cursor) {
		try {
			String raw = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8);
			int separator = raw.indexOf(SEPARATOR);
			return new TripCursor(Instant.parse(raw.substring(0, separator)), UUID.fromString(raw.substring(separator + 1)));
		} catch (RuntimeException ex) {
			throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
					List.of(new ErrorField("cursor", "올바르지 않은 커서입니다. 처음부터 다시 조회해 주세요.")));
		}
	}

}
