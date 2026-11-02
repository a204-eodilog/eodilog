package com.eodilog.expense.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

// 정산 한 번에서 멤버 한 명의 결제·원금 부담·올림 부담·잔액
@Entity
@Table(name = "settlement_members")
@IdClass(SettlementMemberId.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SettlementMember {

	@Id
	private UUID settlementId;

	@Id
	private UUID memberId;

	private long paidMinor;

	private long baseOwedMinor;

	private long owedMinor;

	private long roundingAdjustmentMinor;

	private long balanceMinor;

	// 계산할 때의 참여 순(1부터). 조회는 이 순서로 한다
	private int displayOrder;

	public static SettlementMember of(UUID settlementId, SettlementCalculator.MemberResult result, int displayOrder) {
		SettlementMember member = new SettlementMember();
		member.settlementId = settlementId;
		member.memberId = result.memberId();
		member.paidMinor = result.paidMinor();
		member.baseOwedMinor = result.baseOwedMinor();
		member.owedMinor = result.owedMinor();
		member.roundingAdjustmentMinor = result.roundingAdjustmentMinor();
		member.balanceMinor = result.balanceMinor();
		member.displayOrder = displayOrder;
		return member;
	}

}
