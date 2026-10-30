package com.eodilog.expense.domain;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

// 원금 균등 분담(명세 §7, D-7). 나누어떨어지지 않는 1원은 참여 순(joinOrder)이 빠른 분담자부터 1원씩 더 낸다
// 정산의 1인 부담액 10원 올림은 여기서 하지 않는다(Q-10). 분담액 합계는 항상 원금과 같다
public final class EqualSplit {

	private EqualSplit() {
	}

	// participantsInJoinOrder는 참여 순으로 정렬해 넘긴다. 결과도 같은 순서다
	public static Map<UUID, Long> split(long amountMinor, List<UUID> participantsInJoinOrder) {
		int count = participantsInJoinOrder.size();
		if (count == 0) {
			throw new IllegalArgumentException("At least one participant is required");
		}
		long base = amountMinor / count;
		long remainder = amountMinor % count;
		Map<UUID, Long> shares = new LinkedHashMap<>();
		for (int index = 0; index < count; index++) {
			shares.put(participantsInJoinOrder.get(index), base + (index < remainder ? 1 : 0));
		}
		return shares;
	}

}
