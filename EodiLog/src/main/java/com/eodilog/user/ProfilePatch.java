package com.eodilog.user;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonSetter;
import com.eodilog.user.dto.AccountVisibility;
import com.eodilog.user.dto.AgeBand;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

// PATCH /me 본문. 보낸 필드만 바꾼다. 빈 본문·표에 없는 필드는 400이다.
// null은 profileImageAssetId(사진 지우기)·ageBand(연령대 지우기)에만 허용하고 나머지는 400이다.
// setter가 불렸는지로 생략과 null을 구분한다(SettingsPatch와 같은 방식)
@Schema(description = "바꿀 필드만 보낸다. 가입 대기 사용자는 nickname이 필수이며 저장하면 가입 완료된다")
public class ProfilePatch {

	@Schema(description = "공백 제거 후 1~50자 닉네임", example = "여행자")
	private String nickname;
	@Schema(description = "계정 공개 범위. PUBLIC으로 바꾸면 받은 팔로우 요청을 모두 수락한다. PRIVATE로 바꿔도 기존 팔로워는 유지한다",
			example = "PUBLIC")
	private AccountVisibility accountVisibility;
	@Schema(description = "프로필 사진. 본인이 올린 READY 상태 PROFILE 파일 ID(POST /assets/upload-intents → complete). null이면 사진을 지운다",
			example = "0196f1d2-7c3a-7b2e-9a41-5c2d8e0b7c45", nullable = true)
	private UUID profileImageAssetId;
	@Schema(description = "비공개 연령대. 본인에게만 보인다. null이면 지운다", example = "TWENTIES", nullable = true)
	private AgeBand ageBand;
	@Schema(description = "연령 활용 동의", example = "true")
	private Boolean ageUseConsent;
	private boolean imageSent;
	private boolean ageBandSent;
	private boolean nullSent;

	public String nickname() { return nickname; }
	public AccountVisibility accountVisibility() { return accountVisibility; }
	public UUID profileImageAssetId() { return profileImageAssetId; }
	public AgeBand ageBand() { return ageBand; }
	public Boolean ageUseConsent() { return ageUseConsent; }
	@JsonIgnore public boolean imageSent() { return imageSent; }
	@JsonIgnore public boolean ageBandSent() { return ageBandSent; }

	// null을 허용하지 않는 필드에 null이 왔는지
	@JsonIgnore
	public boolean hasExplicitNull() { return nullSent; }

	@JsonIgnore
	public boolean isEmpty() {
		return nickname == null && accountVisibility == null && !imageSent && !ageBandSent && ageUseConsent == null;
	}

	@JsonSetter("nickname")
	public void setNickname(String value) { nickname = value; nullSent |= value == null; }

	@JsonSetter("accountVisibility")
	public void setAccountVisibility(AccountVisibility value) { accountVisibility = value; nullSent |= value == null; }

	@JsonSetter("profileImageAssetId")
	public void setProfileImageAssetId(UUID value) { profileImageAssetId = value; imageSent = true; }

	@JsonSetter("ageBand")
	public void setAgeBand(AgeBand value) { ageBand = value; ageBandSent = true; }

	@JsonSetter("ageUseConsent")
	public void setAgeUseConsent(Boolean value) { ageUseConsent = value; nullSent |= value == null; }

}
