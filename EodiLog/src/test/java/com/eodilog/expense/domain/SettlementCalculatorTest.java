package com.eodilog.expense.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.eodilog.expense.domain.SettlementCalculator.ExpenseInput;
import com.eodilog.expense.domain.SettlementCalculator.MemberResult;
import com.eodilog.expense.domain.SettlementCalculator.Result;
import com.eodilog.expense.domain.SettlementCalculator.ShareInput;
import com.eodilog.expense.domain.SettlementCalculator.TransferResult;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class SettlementCalculatorTest {

	// UUID 순서와 참여 순서를 일부러 반대로 둬서 동률 기준이 참여 순인지 확인한다
	private final UUID first = UUID.fromString("00000000-0000-7000-8000-000000000003");
	private final UUID second = UUID.fromString("00000000-0000-7000-8000-000000000002");
	private final UUID third = UUID.fromString("00000000-0000-7000-8000-000000000001");
	private final Map<UUID, Long> joinOrders = Map.of(first, 1L, second, 2L, third, 3L);

	@Test
	void roundsTripTotalOnceAndGivesAdjustmentToTopCreditor() {
		// A 답변 §3 예시: 10,001원 경비 3건을 세 사람이 균등 분담, 모두 first가 결제
		List<ExpenseInput> expenses = new ArrayList<>();
		for (int i = 0; i < 3; i++) {
			expenses.add(equalSplit(10001, first));
		}

		Result result = SettlementCalculator.calculate(expenses, joinOrders);

		assertThat(result.totalAmountMinor()).isEqualTo(30003);
		assertThat(result.members()).extracting(MemberResult::baseOwedMinor).containsExactly(10002L, 10002L, 9999L);
		assertThat(result.members()).extracting(MemberResult::owedMinor).containsExactly(10010L, 10010L, 10000L);
		assertThat(result.members()).extracting(MemberResult::roundingAdjustmentMinor).containsExactly(8L, 8L, 1L);
		assertThat(result.roundingAdjustmentMinor()).isEqualTo(17);
		assertThat(result.recipientMemberId()).isEqualTo(first);
		assertThat(result.members()).extracting(MemberResult::balanceMinor).containsExactly(20010L, -10010L, -10000L);
		assertThat(result.transfers()).containsExactly(
				new TransferResult(second, first, 10010),
				new TransferResult(third, first, 10000));
	}

	@Test
	void doesNotRoundPerExpense() {
		// 지출별로 올리면 1,010 + 1,010 = 2,020원이지만 여행 합산 2,002원을 한 번 올려 2,010원
		Result result = SettlementCalculator.calculate(
				List.of(single(1001, second, first), single(1001, second, first)), joinOrders);

		MemberResult firstMember = member(result, first);
		assertThat(firstMember.baseOwedMinor()).isEqualTo(2002);
		assertThat(firstMember.owedMinor()).isEqualTo(2010);
		assertThat(result.roundingAdjustmentMinor()).isEqualTo(8);
	}

	@Test
	void keepsZeroShareAtZero() {
		Result result = SettlementCalculator.calculate(List.of(equalSplit(1, first)), joinOrders);

		assertThat(result.members()).extracting(MemberResult::owedMinor).containsExactly(10L, 0L, 0L);
		assertThat(result.members()).extracting(MemberResult::balanceMinor).containsExactly(0L, 0L, 0L);
		assertThat(result.transfers()).isEmpty();
	}

	@Test
	void breaksCreditorTieByJoinOrderNotMemberId() {
		// second와 third가 똑같이 받을 돈 501원. 멤버 ID는 third가 작지만 참여 순이 빠른 second가 차액을 받는다
		Result result = SettlementCalculator.calculate(List.of(
				new ExpenseInput(UUID.randomUUID(), 1001, second,
						List.of(new ShareInput(first, 501), new ShareInput(second, 500))),
				new ExpenseInput(UUID.randomUUID(), 1001, third,
						List.of(new ShareInput(first, 501), new ShareInput(third, 500)))), joinOrders);

		assertThat(member(result, second).paidMinor() - member(result, second).baseOwedMinor())
				.isEqualTo(member(result, third).paidMinor() - member(result, third).baseOwedMinor());
		assertThat(result.roundingAdjustmentMinor()).isEqualTo(8);
		assertThat(result.recipientMemberId()).isEqualTo(second);
		assertThat(sumOfBalances(result)).isZero();
	}

	@Test
	void picksLargestPayerWhenEveryoneIsSettledOnPrincipal() {
		// 각자 자기 경비만 냄 → 원금 기준 받을 돈은 모두 0. 결제 합계가 가장 큰 third가 차액을 받는다
		Result result = SettlementCalculator.calculate(List.of(
				single(1001, first, first), single(1001, second, second), single(3001, third, third)), joinOrders);

		assertThat(result.recipientMemberId()).isEqualTo(third);
		assertThat(result.roundingAdjustmentMinor()).isEqualTo(27);
		assertThat(member(result, third).balanceMinor()).isEqualTo(3001 - 3010 + 27);
		assertThat(sumOfBalances(result)).isZero();
		assertThat(result.transfers()).containsExactly(
				new TransferResult(first, third, 9),
				new TransferResult(second, third, 9));
	}

	@Test
	void returnsEmptyResultWithoutExpenses() {
		Result result = SettlementCalculator.calculate(List.of(), joinOrders);

		assertThat(result.totalAmountMinor()).isZero();
		assertThat(result.roundingAdjustmentMinor()).isZero();
		assertThat(result.recipientMemberId()).isNull();
		assertThat(result.members()).isEmpty();
		assertThat(result.transfers()).isEmpty();
	}

	@Test
	void transferCountStaysBelowMemberCount() {
		Result result = SettlementCalculator.calculate(List.of(
				equalSplit(30000, first), equalSplit(9000, second), equalSplit(3001, third)), joinOrders);

		assertThat(sumOfBalances(result)).isZero();
		assertThat(result.transfers()).hasSizeLessThan(3);
		assertThat(result.transfers()).allSatisfy(transfer -> assertThat(transfer.amountMinor()).isPositive());
	}

	@Test
	void rejectsMemberWithoutJoinOrder() {
		assertThatThrownBy(() -> SettlementCalculator.calculate(
				List.of(single(1000, UUID.randomUUID(), first)), joinOrders))
				.isInstanceOf(IllegalStateException.class);
	}

	@Test
	void roundsUpToTenWon() {
		assertThat(SettlementCalculator.ceilToUnit(0)).isZero();
		assertThat(SettlementCalculator.ceilToUnit(1)).isEqualTo(10);
		assertThat(SettlementCalculator.ceilToUnit(10)).isEqualTo(10);
		assertThat(SettlementCalculator.ceilToUnit(3_333_334)).isEqualTo(3_333_340);
	}

	private ExpenseInput equalSplit(long amount, UUID payer) {
		List<UUID> participants = List.of(first, second, third);
		List<ShareInput> shares = new ArrayList<>();
		EqualSplit.split(amount, participants).forEach((memberId, share) -> shares.add(new ShareInput(memberId, share)));
		return new ExpenseInput(UUID.randomUUID(), amount, payer, shares);
	}

	private ExpenseInput single(long amount, UUID payer, UUID participant) {
		return new ExpenseInput(UUID.randomUUID(), amount, payer, List.of(new ShareInput(participant, amount)));
	}

	private MemberResult member(Result result, UUID memberId) {
		return result.members().stream().filter(m -> m.memberId().equals(memberId)).findFirst().orElseThrow();
	}

	private long sumOfBalances(Result result) {
		return result.members().stream().mapToLong(MemberResult::balanceMinor).sum();
	}

}
