package com.eodilog.voicetrip;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

// 정리 작업을 누가 만들었는지 기억한다. 만든 사람만 결과를 본다
// AI 서버가 작업을 30분 뒤 지우므로 조금 더 길게 둔다. 서버를 다시 켜면 비고, 그때는 작업도 다시 만들어야 한다
@Component
public class VoiceTripJobOwners {

	static final Duration KEEP = Duration.ofMinutes(40);

	private record Owner(UUID userId, Instant at) {
	}

	private final Map<String, Owner> owners = new ConcurrentHashMap<>();
	private final Clock clock;

	public VoiceTripJobOwners(Clock clock) {
		this.clock = clock;
	}

	public void put(String jobId, UUID userId) {
		Instant now = clock.instant();
		owners.values().removeIf(o -> o.at().plus(KEEP).isBefore(now));
		owners.put(jobId, new Owner(userId, now));
	}

	public boolean owns(String jobId, UUID userId) {
		Owner owner = owners.get(jobId);
		return owner != null && owner.userId().equals(userId)
				&& !owner.at().plus(KEEP).isBefore(clock.instant());
	}

}
