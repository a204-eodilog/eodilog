package com.eodilog.checklist.dto;

import com.fasterxml.jackson.annotation.JsonSetter;
import io.swagger.v3.oas.annotations.media.Schema;

// 명세 §6 PATCH /trips/{tripId}/checklist/{itemId}. 생략한 필드는 유지하고, null은 받지 않는다
// record는 "생략"과 "null"을 구분하지 못하므로 setter가 불렸는지로 보낸 필드를 기록한다
public class UpdateChecklistItemRequest {

	@Schema(description = "조회한 준비물의 version. 그 사이 다른 수정이 있으면 409", example = "1",
			requiredMode = Schema.RequiredMode.REQUIRED)
	private Long expectedVersion;

	@Schema(description = "새 이름. 생략하면 유지. 앞뒤 공백 제거 후 1~255자", example = "보조배터리 2개")
	private String label;

	@Schema(description = "체크 여부. 생략하면 유지. 체크하면 서버가 요청한 멤버와 시각을 기록하고, 해제하면 둘 다 비운다",
			example = "true")
	private Boolean checked;

	private boolean labelSent;
	private boolean checkedSent;

	public Long getExpectedVersion() {
		return expectedVersion;
	}

	public String getLabel() {
		return label;
	}

	public Boolean getChecked() {
		return checked;
	}

	@JsonSetter("expectedVersion")
	public void setExpectedVersion(Long expectedVersion) {
		this.expectedVersion = expectedVersion;
	}

	@JsonSetter("label")
	public void setLabel(String label) {
		this.label = label;
		this.labelSent = true;
	}

	@JsonSetter("checked")
	public void setChecked(Boolean checked) {
		this.checked = checked;
		this.checkedSent = true;
	}

	public boolean sentLabel() {
		return labelSent;
	}

	public boolean sentChecked() {
		return checkedSent;
	}

}
