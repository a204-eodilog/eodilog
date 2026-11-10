package com.eodilog.asset.domain;

import java.util.Set;

// 파일 용도. 용도마다 받는 형식이 다르다(명세 §7, §5 장소 추출 캡처)
public enum AssetPurpose {

	// 프로필 사진. 여러 화면에 그대로 보이므로 브라우저가 바로 그리는 JPG·PNG만 받는다
	PROFILE(Set.of(ImageFormat.JPEG, ImageFormat.PNG)),

	// 장소 추출용 화면 캡처. 명세 §5: JPG/PNG
	CAPTURE(Set.of(ImageFormat.JPEG, ImageFormat.PNG)),

	// 여행 사진. 명세 §7: JPG/PNG/HEIC
	TRIP_PHOTO(Set.of(ImageFormat.JPEG, ImageFormat.PNG, ImageFormat.HEIC));

	private final Set<ImageFormat> formats;

	AssetPurpose(Set<ImageFormat> formats) {
		this.formats = formats;
	}

	public boolean accepts(ImageFormat format) {
		return formats.contains(format);
	}

	public String keyPrefix() {
		return switch (this) {
			case PROFILE -> "profile";
			case CAPTURE -> "capture";
			case TRIP_PHOTO -> "trip-photo";
		};
	}

}
