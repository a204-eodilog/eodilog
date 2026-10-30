package com.eodilog.expense.dto;

import com.eodilog.expense.domain.Expense;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

// 명세 §10 Expense = ExpenseWrite + id·registeredByMemberId·shares·version. 분담자·분담액은 참여 순이다
public record ExpenseResponse(
		@Schema(description = "경비 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e90",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID id,

		@Schema(description = "경비 이름", example = "흑돼지 저녁", requiredMode = Schema.RequiredMode.REQUIRED)
		String title,

		@Schema(description = "메모. 없으면 null", requiredMode = Schema.RequiredMode.REQUIRED, nullable = true)
		String memo,

		@Schema(description = "원금(원)", example = "120000", requiredMode = Schema.RequiredMode.REQUIRED)
		long amountMinor,

		@Schema(description = "통화. KRW 고정", example = "KRW", requiredMode = Schema.RequiredMode.REQUIRED)
		String currency,

		@Schema(description = "실제로 돈을 낸 멤버십 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e7f",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID payerMemberId,

		@Schema(description = "분담자 멤버십 ID 목록(참여 순). 이탈한 멤버도 과거 분담자로 남는다",
				requiredMode = Schema.RequiredMode.REQUIRED)
		List<UUID> participantMemberIds,

		@Schema(description = "지출 시각(UTC)", example = "2026-11-01T11:30:00Z", requiredMode = Schema.RequiredMode.REQUIRED)
		Instant spentAt,

		@Schema(description = "등록한 멤버십 ID. 이 멤버만 수정·삭제할 수 있다",
				example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e7f", requiredMode = Schema.RequiredMode.REQUIRED)
		UUID registeredByMemberId,

		@Schema(description = "분담자별 원금 분담액(참여 순). 합계는 원금과 같다", requiredMode = Schema.RequiredMode.REQUIRED)
		List<ExpenseShareResponse> shares,

		@Schema(description = "경비 version. 수정·삭제 시 expectedVersion으로 보낸다", example = "1",
				requiredMode = Schema.RequiredMode.REQUIRED)
		long version
) {

	public static ExpenseResponse of(Expense expense, List<ExpenseShareResponse> shares) {
		return new ExpenseResponse(expense.getId(), expense.getTitle(), expense.getMemo(), expense.getAmountMinor(),
				expense.getCurrency(), expense.getPayerMemberId(),
				shares.stream().map(ExpenseShareResponse::memberId).toList(), expense.getSpentAt(),
				expense.getRegisteredByMemberId(), shares, expense.getVersion());
	}

}
