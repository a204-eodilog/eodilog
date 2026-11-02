package com.eodilog.expense.domain;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

// 정산 계산(Q-10, 2026-11-02 확정). 저장된 원금 분담액만 읽고 DB·시간에 의존하지 않는다
// 1. 사람별 원금 부담(baseOwed)을 여행 전체로 더한 뒤 한 번만 10원 단위로 올린다(owed). 지출별 올림은 하지 않는다
// 2. 올림으로 생긴 전체 차액은 원금 기준 받을 돈(결제 - 원금 부담)이 가장 많은 한 사람이 가진다
// 3. 받을 돈과 낼 돈을 큰 금액끼리 짝지어 송금 제안을 만든다. 송금액은 다시 올리지 않는다
public final class SettlementCalculator {

	public static final String ROUNDING_POLICY = "TRIP_TOTAL_CEIL_10_TO_TOP_CREDITOR";
	private static final long ROUNDING_UNIT = 10;

	private SettlementCalculator() {
	}

	// joinOrder는 동률을 가르는 기준이다. 경비에 나오는 멤버는 모두 joinOrder가 있어야 한다
	public static Result calculate(List<ExpenseInput> expenses, Map<UUID, Long> joinOrders) {
		Map<UUID, Long> paid = new LinkedHashMap<>();
		Map<UUID, Long> baseOwed = new LinkedHashMap<>();
		for (ExpenseInput expense : expenses) {
			paid.merge(expense.payerMemberId(), expense.amountMinor(), Long::sum);
			baseOwed.putIfAbsent(expense.payerMemberId(), 0L);
			for (ShareInput share : expense.shares()) {
				baseOwed.merge(share.memberId(), share.amountMinor(), Long::sum);
				paid.putIfAbsent(share.memberId(), 0L);
			}
		}

		Comparator<UUID> byJoinOrder = Comparator.<UUID>comparingLong(id -> requireJoinOrder(joinOrders, id))
				.thenComparing(Comparator.naturalOrder());
		List<UUID> memberIds = paid.keySet().stream().sorted(byJoinOrder).toList();

		long totalAdjustment = 0;
		Map<UUID, Long> owed = new LinkedHashMap<>();
		for (UUID memberId : memberIds) {
			long rounded = ceilToUnit(baseOwed.get(memberId));
			owed.put(memberId, rounded);
			totalAdjustment += rounded - baseOwed.get(memberId);
		}
		UUID recipient = memberIds.isEmpty() ? null : pickRecipient(memberIds, paid, baseOwed, byJoinOrder);

		List<MemberResult> members = new ArrayList<>();
		Map<UUID, Long> balances = new LinkedHashMap<>();
		for (UUID memberId : memberIds) {
			long balance = paid.get(memberId) - owed.get(memberId) + (memberId.equals(recipient) ? totalAdjustment : 0);
			balances.put(memberId, balance);
			members.add(new MemberResult(memberId, paid.get(memberId), baseOwed.get(memberId), owed.get(memberId),
					owed.get(memberId) - baseOwed.get(memberId), balance));
		}
		if (balances.values().stream().mapToLong(Long::longValue).sum() != 0) {
			throw new IllegalStateException("Settlement balances do not sum to zero");
		}
		long totalAmount = expenses.stream().mapToLong(ExpenseInput::amountMinor).sum();
		return new Result(totalAmount, totalAdjustment, recipient, members, transfers(balances, byJoinOrder));
	}

	static long ceilToUnit(long amount) {
		return (amount + ROUNDING_UNIT - 1) / ROUNDING_UNIT * ROUNDING_UNIT;
	}

	// 원금 기준 받을 돈이 가장 많은 사람. 모두 0이면 결제 합계가 가장 큰 사람. 동률은 참여 순, 멤버 ID 순
	private static UUID pickRecipient(List<UUID> memberIds, Map<UUID, Long> paid, Map<UUID, Long> baseOwed,
			Comparator<UUID> byJoinOrder) {
		boolean allSettled = memberIds.stream().allMatch(id -> paid.get(id) - baseOwed.get(id) == 0);
		Comparator<UUID> byAmount = allSettled
				? Comparator.<UUID>comparingLong(paid::get).reversed()
				: Comparator.<UUID>comparingLong(id -> paid.get(id) - baseOwed.get(id)).reversed();
		return memberIds.stream().sorted(byAmount.thenComparing(byJoinOrder)).findFirst().orElseThrow();
	}

	// 낼 돈이 큰 사람이 받을 돈이 큰 사람에게 보낸다. 같은 금액은 참여 순. 송금 건수는 멤버 수 - 1을 넘지 않는다
	private static List<TransferResult> transfers(Map<UUID, Long> balances, Comparator<UUID> byJoinOrder) {
		List<UUID> creditors = balances.keySet().stream().filter(id -> balances.get(id) > 0)
				.sorted(Comparator.<UUID>comparingLong(balances::get).reversed().thenComparing(byJoinOrder)).toList();
		List<UUID> debtors = balances.keySet().stream().filter(id -> balances.get(id) < 0)
				.sorted(Comparator.<UUID>comparingLong(balances::get).thenComparing(byJoinOrder)).toList();
		Map<UUID, Long> remaining = new LinkedHashMap<>(balances);
		List<TransferResult> transfers = new ArrayList<>();
		int c = 0;
		int d = 0;
		while (c < creditors.size() && d < debtors.size()) {
			UUID creditor = creditors.get(c);
			UUID debtor = debtors.get(d);
			long amount = Math.min(remaining.get(creditor), -remaining.get(debtor));
			transfers.add(new TransferResult(debtor, creditor, amount));
			remaining.merge(creditor, -amount, Long::sum);
			remaining.merge(debtor, amount, Long::sum);
			if (remaining.get(creditor) == 0) {
				c++;
			}
			if (remaining.get(debtor) == 0) {
				d++;
			}
		}
		return transfers;
	}

	private static long requireJoinOrder(Map<UUID, Long> joinOrders, UUID memberId) {
		Long joinOrder = joinOrders.get(memberId);
		if (joinOrder == null) {
			throw new IllegalStateException("Expense member is not a trip member: " + memberId);
		}
		return joinOrder;
	}

	public record ExpenseInput(UUID expenseId, long amountMinor, UUID payerMemberId, List<ShareInput> shares) {
	}

	public record ShareInput(UUID memberId, long amountMinor) {
	}

	// recipientMemberId는 경비가 없으면 null
	public record Result(long totalAmountMinor, long roundingAdjustmentMinor, UUID recipientMemberId,
			List<MemberResult> members, List<TransferResult> transfers) {
	}

	public record MemberResult(UUID memberId, long paidMinor, long baseOwedMinor, long owedMinor,
			long roundingAdjustmentMinor, long balanceMinor) {
	}

	public record TransferResult(UUID fromMemberId, UUID toMemberId, long amountMinor) {
	}

}
