package com.eodilog.user.dto;

import java.util.UUID;

// 프로필 사진 URL. /api/v1 뒤 경로이며 GET /assets/{assetId}/download로 받는다(READY PROFILE은 로그인 사용자 누구나).
// 프로필 사진은 저장할 때 본인 소유 READY PROFILE인지 확인하고, READY PROFILE은 자동 정리하지 않는다
public final class ProfileImages {

	private ProfileImages() {
	}

	public static String url(UUID assetId) {
		return assetId == null ? null : "/assets/" + assetId + "/download";
	}

}
