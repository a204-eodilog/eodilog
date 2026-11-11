package com.eodilog.place.service;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.*;

/**
 * 장소 검색 커서. 마지막 줄의 위치와 검색 조건(검색어·near·지역)을 함께 담아 조건이 바뀐 커서를 거부한다.
 * rank는 {@link PlaceSearchReader}의 단계다. near가 있으면 (단계 0~3, 거리, id)이고 3단계(id 순) 거리는 0이다.
 * near가 없으면 (단계 0~2, 이름 키, id)이고 이름 키는 1단계(앞부분 일치)에만 있다.
 * 이름 키에 구분자가 있어도 되도록 마지막에 둔다.
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
				: "Q|" + binding + "|" + rank + "|" + id + "|" + (name == null ? "" : name);
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
				if (rank < 0 || rank > 3 || !Double.isFinite(distance) || distance < 0 || rank == 3 && distance != 0)
					throw new IllegalArgumentException();
				cursor = new PlaceSearchCursor(binding, rank, distance, null, id);
			} else {
				String key = parts[4];
				if (rank < 0 || rank > 2 || (rank == 1) == key.isEmpty() || key.length() > 255 || key.indexOf('\0') >= 0)
					throw new IllegalArgumentException();
				cursor = new PlaceSearchCursor(binding, rank, null, rank == 1 ? key : null, id);
			}
			if (!cursor.encode().equals(value)) throw new IllegalArgumentException();
			return cursor;
		} catch (RuntimeException ex) {
			throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
					List.of(new ErrorField("cursor", "올바르지 않은 커서입니다. 처음부터 다시 조회해 주세요.")));
		}
	}
}
