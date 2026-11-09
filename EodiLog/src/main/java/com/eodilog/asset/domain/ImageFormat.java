package com.eodilog.asset.domain;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;

// 받는 이미지 형식. 앱이 알려준 Content-Type과 파일 앞부분 시그니처가 같은 형식이어야 한다
public enum ImageFormat {

	JPEG(Set.of("image/jpeg")),
	PNG(Set.of("image/png")),
	// HEIF 컨테이너 안의 HEVC 이미지. iOS는 image/heic, 일부 도구는 image/heif로 보낸다
	HEIC(Set.of("image/heic", "image/heif"));

	// 형식 판정에 읽는 앞부분 길이. HEIC는 ftyp 상자의 호환 브랜드 목록까지 본다
	public static final int SIGNATURE_LENGTH = 64;

	private static final byte[] PNG_SIGNATURE = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'};
	private static final Set<String> HEIC_BRANDS = Set.of("heic", "heix", "heim", "heis", "hevc", "hevx");
	// 일반 HEIF 브랜드. 이것만으로는 AVIF일 수도 있어 호환 브랜드에 HEIC 브랜드가 있어야 받는다
	private static final Set<String> GENERIC_HEIF_BRANDS = Set.of("mif1", "msf1");

	private final Set<String> contentTypes;

	ImageFormat(Set<String> contentTypes) {
		this.contentTypes = contentTypes;
	}

	public static Optional<ImageFormat> fromContentType(String contentType) {
		if (contentType == null) {
			return Optional.empty();
		}
		String normalized = contentType.strip().toLowerCase(Locale.ROOT);
		return Arrays.stream(values()).filter(format -> format.contentTypes.contains(normalized)).findFirst();
	}

	// 파일 앞부분으로 실제 형식을 판정한다. 확장자나 앱이 보낸 Content-Type은 믿지 않는다
	public static Optional<ImageFormat> detect(byte[] head) {
		if (head.length >= 3 && (head[0] & 0xFF) == 0xFF && (head[1] & 0xFF) == 0xD8 && (head[2] & 0xFF) == 0xFF) {
			return Optional.of(JPEG);
		}
		if (head.length >= PNG_SIGNATURE.length
				&& Arrays.equals(Arrays.copyOf(head, PNG_SIGNATURE.length), PNG_SIGNATURE)) {
			return Optional.of(PNG);
		}
		if (isHeic(head)) {
			return Optional.of(HEIC);
		}
		return Optional.empty();
	}

	// ISO BMFF: [상자 크기 4바이트]['ftyp'][주 브랜드 4][버전 4][호환 브랜드 4 × n]
	private static boolean isHeic(byte[] head) {
		if (head.length < 12 || !"ftyp".equals(ascii(head, 4))) {
			return false;
		}
		String major = ascii(head, 8);
		if (HEIC_BRANDS.contains(major)) {
			return true;
		}
		if (!GENERIC_HEIF_BRANDS.contains(major)) {
			return false;
		}
		long boxSize = ((head[0] & 0xFFL) << 24) | ((head[1] & 0xFFL) << 16) | ((head[2] & 0xFFL) << 8) | (head[3] & 0xFFL);
		int end = (int) Math.min(boxSize, head.length);
		for (int offset = 16; offset + 4 <= end; offset += 4) {
			if (HEIC_BRANDS.contains(ascii(head, offset))) {
				return true;
			}
		}
		return false;
	}

	private static String ascii(byte[] bytes, int offset) {
		return new String(bytes, offset, 4, StandardCharsets.US_ASCII);
	}

}
