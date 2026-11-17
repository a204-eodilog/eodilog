package com.eodilog.voicetrip;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

class VoiceTripJobOwnersTest {

	private final AtomicReference<Instant> now = new AtomicReference<>(Instant.parse("2026-11-17T00:00:00Z"));
	private final Clock clock = new Clock() {
		@Override
		public ZoneOffset getZone() {
			return ZoneOffset.UTC;
		}

		@Override
		public Clock withZone(java.time.ZoneId zone) {
			return this;
		}

		@Override
		public Instant instant() {
			return now.get();
		}
	};

	@Test
	void onlyTheMakerSeesTheJobUntilItExpires() {
		VoiceTripJobOwners owners = new VoiceTripJobOwners(clock);
		UUID me = UUID.randomUUID();
		owners.put("job", me);

		assertThat(owners.owns("job", me)).isTrue();
		assertThat(owners.owns("job", UUID.randomUUID())).isFalse();
		assertThat(owners.owns("other", me)).isFalse();

		now.set(now.get().plus(VoiceTripJobOwners.KEEP).plusSeconds(1));
		assertThat(owners.owns("job", me)).isFalse();
	}

}
