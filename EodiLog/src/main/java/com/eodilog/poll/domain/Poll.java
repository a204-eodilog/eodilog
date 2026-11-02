package com.eodilog.poll.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UuidGenerator;

// version은 후보 추가와 마감 때만 오른다. 다른 멤버의 투표로는 오르지 않아 동시 투표끼리 409를 만들지 않는다(V-8)
// 집계 인원은 마감 때만 저장한다. OPEN 동안은 지금 ACTIVE 멤버로 그때그때 센다(V-6c·V-6d)
@Entity
@Table(name = "polls")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Poll {

	@Id
	@UuidGenerator(style = UuidGenerator.Style.VERSION_7)
	private UUID id;

	private UUID tripId;

	private UUID createdByMemberId;

	@Enumerated(EnumType.STRING)
	private PollType type;

	private String title;

	@Enumerated(EnumType.STRING)
	private PollStatus status;

	private long version;

	private Instant closesAt;

	@Enumerated(EnumType.STRING)
	private PollClosedReason closedReason;

	private Instant closedAt;

	private Instant finalizedAt;

	private Integer eligibleMemberCount;

	private Integer votedMemberCount;

	private Instant createdAt;

	public static Poll open(UUID tripId, UUID createdByMemberId, PollType type, String title, Instant closesAt,
			Instant now) {
		Poll poll = new Poll();
		poll.tripId = tripId;
		poll.createdByMemberId = createdByMemberId;
		poll.type = type;
		poll.title = title;
		poll.status = PollStatus.OPEN;
		poll.version = 1;
		poll.closesAt = closesAt;
		poll.createdAt = now;
		return poll;
	}

	// 서버 시각이 마감 시각 이상이면 더는 쓰지 못한다(명세 §6)
	public boolean isDue(Instant now) {
		return status == PollStatus.OPEN && !now.isBefore(closesAt);
	}

	public void markCandidateAdded() {
		this.version++;
	}

	// 0표 마감. 결정권자를 기다리지 않고 확정 없이 끝낸다
	public void closeWithoutVotes(int eligibleMemberCount, Instant now) {
		this.status = PollStatus.CLOSED;
		this.closedReason = PollClosedReason.NO_VOTES;
		this.closedAt = now;
		this.eligibleMemberCount = eligibleMemberCount;
		this.votedMemberCount = 0;
		this.version++;
	}

	// 최다 득표 후보를 모두 확정한 마감. 확정 후보는 poll_results에 따로 저장한다
	public void finalizeResult(int eligibleMemberCount, int votedMemberCount, Instant now) {
		this.status = PollStatus.FINALIZED;
		this.closedReason = PollClosedReason.DEADLINE;
		this.closedAt = now;
		this.finalizedAt = now;
		this.eligibleMemberCount = eligibleMemberCount;
		this.votedMemberCount = votedMemberCount;
		this.version++;
	}

}
