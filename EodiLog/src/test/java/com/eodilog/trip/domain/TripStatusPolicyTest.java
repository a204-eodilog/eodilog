package com.eodilog.trip.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class TripStatusPolicyTest {

	private static final LocalDate START = LocalDate.of(2026, 11, 1);
	private static final LocalDate END = LocalDate.of(2026, 11, 3);

	@Test
	void planningWithoutPeriod() {
		assertThat(TripStatusPolicy.resolve(null, null, START)).isEqualTo(TripStatus.PLANNING);
	}

	@Test
	void planningBeforeStartDate() {
		assertThat(TripStatusPolicy.resolve(START, END, START.minusDays(1))).isEqualTo(TripStatus.PLANNING);
	}

	@Test
	void ongoingFromStartDateThroughEndDate() {
		assertThat(TripStatusPolicy.resolve(START, END, START)).isEqualTo(TripStatus.ONGOING);
		assertThat(TripStatusPolicy.resolve(START, END, END)).isEqualTo(TripStatus.ONGOING);
	}

	@Test
	void ongoingForSameDayTrip() {
		assertThat(TripStatusPolicy.resolve(START, START, START)).isEqualTo(TripStatus.ONGOING);
	}

	@Test
	void completedAfterEndDate() {
		assertThat(TripStatusPolicy.resolve(START, END, END.plusDays(1))).isEqualTo(TripStatus.COMPLETED);
	}

	@Test
	void todayUsesSeoulDate() {
		// UTC 10/31 15:00은 서울 11/1 00:00
		Clock clock = Clock.fixed(Instant.parse("2026-10-31T15:00:00Z"), ZoneOffset.UTC);

		assertThat(TripStatusPolicy.today(clock)).isEqualTo(START);
	}

}
