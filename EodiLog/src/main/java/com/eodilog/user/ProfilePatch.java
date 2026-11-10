package com.eodilog.user;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonSetter;
import com.eodilog.user.dto.AccountVisibility;
import io.swagger.v3.oas.annotations.media.Schema;

// PATCH /me 본문. 보낸 필드만 바꾼다. 명시적 null·빈 본문·표에 없는 필드는 400이다.
// setter가 불렸는지로 생략과 null을 구분한다(SettingsPatch와 같은 방식)
@Schema(description = "바꿀 필드만 보낸다. 가입 대기 사용자는 nickname이 필수이며 저장하면 가입 완료된다")
public class ProfilePatch {

	@Schema(description = "공백 제거 후 1~50자 닉네임", example = "여행자")
	private String nickname;
	@Schema(description = "계정 공개 범위. PUBLIC으로 바꾸면 받은 팔로우 요청을 모두 수락한다. PRIVATE로 바꿔도 기존 팔로워는 유지한다",
			example = "PUBLIC")
	private AccountVisibility accountVisibility;
	private boolean nullSent;

	public String nickname() { return nickname; }
	public AccountVisibility accountVisibility() { return accountVisibility; }

	@JsonIgnore
	public boolean hasExplicitNull() { return nullSent; }

	@JsonIgnore
	public boolean isEmpty() { return nickname == null && accountVisibility == null; }

	@JsonSetter("nickname")
	public void setNickname(String value) { nickname = value; nullSent |= value == null; }

	@JsonSetter("accountVisibility")
	public void setAccountVisibility(AccountVisibility value) { accountVisibility = value; nullSent |= value == null; }

}
