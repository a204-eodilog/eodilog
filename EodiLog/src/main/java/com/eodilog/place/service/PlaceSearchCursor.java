package com.eodilog.place.service;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.*;

/**
 * 장소 검색 커서. 정렬 키와 검색 조건(검색어·near·지역)을 함께 담아 조건이 바뀐 커서를 거부한다.
 * near가 있으면 (일치 단계, 거리, id), 없으면 (일치 단계, 이름, id)이다. 이름 길이는 이름에서 다시 계산한다.
 * 이름에 구분자가 있어도 되도록 이름을 마지막에 둔다.
 */
record PlaceSearchCursor(String binding, int rank, Double distance, String name, UUID id) {

	static String binding(String query, String near, UUID regionId) {
		String raw = query + "\u0000" + (near == null ? "" : near) + "\u0000" + (regionId == null ? "" : regionId);
		try {
			byte[] digest = MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8));
			return Base64.getUrlEncoder().withoutPadding().encodeToString(Arrays.copyOf(digest, 12));
		} catch (NoSuchAlgorithmException ex) {
			throw new IllegalStateException(ex);
		}
	}

	String encode() {
		String raw = distance != null
				? "N|" + binding + "|" + rank + "|" + id + "|" + distance
				: "Q|" + binding + "|" + rank + "|" + id + "|" + name;
		return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
	}

	static PlaceSearchCursor decode(String value, String binding, boolean near) {
		try {
			if (value.length() > 2048 || !value.matches("[A-Za-z0-9_-]+")) throw new IllegalArgumentException();
			String[] parts = new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8).split("\\|", 5);
			if (parts.length != 5 || !parts[1].equals(binding) || !parts[0].equals(near ? "N" : "Q"))
				throw new IllegalArgumentException();
			int rank = Integer.parseInt(parts[2]);
			UUID id = UUID.fromString(parts[3]);
			PlaceSearchCursor cursor;
			if (near) {
				double distance = Double.parseDouble(parts[4]);
				if (rank < 0 || rank > 1 || !Double.isFinite(distance) || distance < 0) throw new IllegalArgumentException();
				cursor = new PlaceSearchCursor(binding, rank, distance, null, id);
			} else {
				if (rank < 0 || rank > 2 || parts[4].isEmpty() || parts[4].length() > 255 || parts[4].indexOf('\0') >= 0)
					throw new IllegalArgumentException();
				cursor = new PlaceSearchCursor(binding, rank, null, parts[4], id);
			}
			if (!cursor.encode().equals(value)) throw new IllegalArgumentException();
			return cursor;
		} catch (RuntimeException ex) {
			throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
					List.of(new ErrorField("cursor", "올바르지 않은 커서입니다. 처음부터 다시 조회해 주세요.")));
		}
	}
}
