package com.eodilog.poll.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

// 마감 때 최다 득표 후보마다 한 행(동률 포함). FINALIZED 투표에만 있다
@Entity
@Table(name = "poll_results")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PollResult {

	@Id
	private UUID candidateId;

	private Instant selectedAt;

	public static PollResult of(UUID candidateId, Instant now) {
		PollResult result = new PollResult();
		result.candidateId = candidateId;
		result.selectedAt = now;
		return result;
	}

}
