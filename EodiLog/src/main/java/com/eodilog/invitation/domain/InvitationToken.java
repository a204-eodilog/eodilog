package com.eodilog.invitation.domain;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.regex.Pattern;

// 초대 토큰은 32바이트 난수의 base64url(패딩 없음, 43자)이다. DB에는 SHA-256 해시(16진수)만 남긴다
public final class InvitationToken {

	private static final SecureRandom RANDOM = new SecureRandom();
	private static final Pattern FORMAT = Pattern.compile("[A-Za-z0-9_-]{43}");

	private InvitationToken() {
	}

	public static String generate() {
		byte[] bytes = new byte[32];
		RANDOM.nextBytes(bytes);
		return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
	}

	// 형식이 다르면 DB를 조회하지 않는다. 형식만 맞는 토큰의 검증 실패는 410으로 구분한다(명세 §2)
	public static boolean isWellFormed(String token) {
		return token != null && FORMAT.matcher(token).matches();
	}

	public static String hash(String token) {
		try {
			return HexFormat.of().formatHex(
					MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.US_ASCII)));
		} catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}

}
