package com.eodilog.asset.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class ImageFormatTest {

	static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 0x10, 'J', 'F', 'I', 'F', 0};
	static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n', 0, 0, 0, 0x0D, 'I', 'H', 'D', 'R'};

	@Test
	void detectsBySignatureNotByName() {
		assertThat(ImageFormat.detect(JPEG)).contains(ImageFormat.JPEG);
		assertThat(ImageFormat.detect(PNG)).contains(ImageFormat.PNG);
		assertThat(ImageFormat.detect(ftyp("heic"))).contains(ImageFormat.HEIC);
		assertThat(ImageFormat.detect(ftyp("hevc"))).contains(ImageFormat.HEIC);
		// 일반 HEIF 브랜드는 호환 브랜드에 HEIC가 있을 때만
		assertThat(ImageFormat.detect(ftyp("mif1", "heic"))).contains(ImageFormat.HEIC);
		assertThat(ImageFormat.detect(ftyp("mif1", "avif"))).isEmpty();
		assertThat(ImageFormat.detect(ftyp("avif", "mif1"))).isEmpty();
		// GIF, 텍스트, 빈 파일, 잘린 시그니처
		assertThat(ImageFormat.detect("GIF89a....".getBytes(StandardCharsets.US_ASCII))).isEmpty();
		assertThat(ImageFormat.detect("<html>".getBytes(StandardCharsets.US_ASCII))).isEmpty();
		assertThat(ImageFormat.detect(new byte[0])).isEmpty();
		assertThat(ImageFormat.detect(new byte[] {(byte) 0xFF, (byte) 0xD8})).isEmpty();
	}

	@Test
	void mapsContentTypesCaseInsensitively() {
		assertThat(ImageFormat.fromContentType("image/jpeg")).contains(ImageFormat.JPEG);
		assertThat(ImageFormat.fromContentType(" Image/PNG ")).contains(ImageFormat.PNG);
		assertThat(ImageFormat.fromContentType("image/heif")).contains(ImageFormat.HEIC);
		assertThat(ImageFormat.fromContentType("image/jpg")).isEmpty();
		assertThat(ImageFormat.fromContentType("image/gif")).isEmpty();
		assertThat(ImageFormat.fromContentType(null)).isEmpty();
	}

	@Test
	void purposesAcceptOnlyTheirFormats() {
		assertThat(AssetPurpose.TRIP_PHOTO.accepts(ImageFormat.HEIC)).isTrue();
		assertThat(AssetPurpose.CAPTURE.accepts(ImageFormat.HEIC)).isFalse();
		assertThat(AssetPurpose.PROFILE.accepts(ImageFormat.HEIC)).isFalse();
		assertThat(AssetPurpose.PROFILE.accepts(ImageFormat.PNG)).isTrue();
	}

	// [크기]['ftyp'][주 브랜드][버전 0][호환 브랜드...]
	static byte[] ftyp(String major, String... compatible) {
		int size = 16 + 4 * compatible.length;
		byte[] bytes = new byte[size + 8];
		bytes[3] = (byte) size;
		put(bytes, 4, "ftyp");
		put(bytes, 8, major);
		for (int i = 0; i < compatible.length; i++) {
			put(bytes, 16 + 4 * i, compatible[i]);
		}
		return bytes;
	}

	private static void put(byte[] bytes, int offset, String brand) {
		System.arraycopy(brand.getBytes(StandardCharsets.US_ASCII), 0, bytes, offset, 4);
	}

}
