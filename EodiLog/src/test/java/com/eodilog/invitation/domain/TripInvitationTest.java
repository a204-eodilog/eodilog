package com.eodilog.invitation.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class TripInvitationTest {

	private final Instant createdAt = Instant.parse("2026-10-30T06:00:00Z");
	private final Instant expiresAt = createdAt.plus(Duration.ofDays(7));
	private final TripInvitation invitation = TripInvitation.create(UUID.randomUUID(), UUID.randomUUID(), "hash",
			expiresAt, createdAt);

	@Test
	void usableUntilJustBeforeExpiry() {
		assertThat(invitation.isExpiredAt(expiresAt.minusNanos(1000))).isFalse();
	}

	@Test
	void expiresExactlyAtExpiryTime() {
		// 명세 §4 "만료 시각부터 참여할 수 없다"
		assertThat(invitation.isExpiredAt(expiresAt)).isTrue();
		assertThat(invitation.isExpiredAt(expiresAt.plusSeconds(1))).isTrue();
	}

}
