package com.eodilog.checklist.dto;

import com.eodilog.checklist.domain.ChecklistItem;
import com.eodilog.checklist.domain.ChecklistSource;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.UUID;

// 명세 §10 ChecklistItem
public record ChecklistItemResponse(
		@Schema(description = "준비물 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e81",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID id,

		@Schema(description = "준비물 이름", example = "보조배터리", requiredMode = Schema.RequiredMode.REQUIRED)
		String label,

		@Schema(description = "체크 여부", example = "true", requiredMode = Schema.RequiredMode.REQUIRED)
		boolean checked,

		@Schema(description = "체크한 멤버십 ID. 체크하지 않았으면 null", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e7f",
				requiredMode = Schema.RequiredMode.REQUIRED, nullable = true)
		UUID checkedByMemberId,

		@Schema(description = "체크한 시각(UTC). 체크하지 않았으면 null", example = "2026-10-29T06:00:00Z",
				requiredMode = Schema.RequiredMode.REQUIRED, nullable = true)
		Instant checkedAt,

		@Schema(description = "직접 작성(MANUAL) 또는 AI 제안 채택(AI)", example = "MANUAL",
				requiredMode = Schema.RequiredMode.REQUIRED)
		ChecklistSource source,

		@Schema(description = "채택한 AI 준비물 제안 작업 ID. 직접 작성이면 null", requiredMode = Schema.RequiredMode.REQUIRED,
				nullable = true)
		UUID sourceJobId,

		@Schema(description = "AI가 제안한 이유. 직접 작성이면 null", requiredMode = Schema.RequiredMode.REQUIRED,
				nullable = true)
		String reason,

		@Schema(description = "멤버가 이름을 고쳤는지 여부", example = "false", requiredMode = Schema.RequiredMode.REQUIRED)
		boolean modifiedByUser,

		@Schema(description = "수정할 때 expectedVersion으로 보낼 값", example = "1", requiredMode = Schema.RequiredMode.REQUIRED)
		long version
) {

	public static ChecklistItemResponse from(ChecklistItem item) {
		return new ChecklistItemResponse(item.getId(), item.getLabel(), item.isChecked(), item.getCheckedByMemberId(),
				item.getCheckedAt(), item.getSource(), item.getSourceJobId(), item.getReason(), item.isModifiedByUser(),
				item.getVersion());
	}

}
