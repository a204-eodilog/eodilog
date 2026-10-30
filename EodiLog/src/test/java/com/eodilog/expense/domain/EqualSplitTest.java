package com.eodilog.expense.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class EqualSplitTest {

	private final UUID first = UUID.randomUUID();
	private final UUID second = UUID.randomUUID();
	private final UUID third = UUID.randomUUID();

	@Test
	void splitsExactly() {
		assertThat(EqualSplit.split(30000, List.of(first, second, third)).values()).containsExactly(10000L, 10000L, 10000L);
	}

	@Test
	void givesRemainderToEarliestParticipantsFirst() {
		// 명세 §7 예시의 원금 10,001원 3인 균등 분담: 원금 보존 표현
		Map<UUID, Long> shares = EqualSplit.split(10001, List.of(first, second, third));

		assertThat(shares).containsExactly(Map.entry(first, 3334L), Map.entry(second, 3334L), Map.entry(third, 3333L));
		assertThat(shares.values().stream().mapToLong(Long::longValue).sum()).isEqualTo(10001);
	}

	@Test
	void allowsZeroShareWhenAmountIsSmallerThanParticipants() {
		assertThat(EqualSplit.split(1, List.of(first, second, third)).values()).containsExactly(1L, 0L, 0L);
	}

	@Test
	void keepsSumForLargeAmount() {
		long amount = 9_007_199_254_740_991L;

		assertThat(EqualSplit.split(amount, List.of(first, second, third)).values().stream()
				.mapToLong(Long::longValue).sum()).isEqualTo(amount);
	}

	@Test
	void requiresParticipant() {
		assertThatThrownBy(() -> EqualSplit.split(1000, List.of())).isInstanceOf(IllegalArgumentException.class);
	}

}
