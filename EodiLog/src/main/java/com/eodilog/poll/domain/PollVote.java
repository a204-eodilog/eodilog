package com.eodilog.poll.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

// 내 선택 교체는 이 투표의 내 표를 지우고 다시 넣는다. 나간 멤버의 표는 지우지 않고 집계에서만 뺀다(V-6b)
@Entity
@Table(name = "poll_votes")
@IdClass(PollVoteId.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PollVote {

	@Id
	private UUID candidateId;

	@Id
	private UUID memberId;

	private Instant createdAt;

	public static PollVote of(UUID candidateId, UUID memberId, Instant now) {
		PollVote vote = new PollVote();
		vote.candidateId = candidateId;
		vote.memberId = memberId;
		vote.createdAt = now;
		return vote;
	}

}
