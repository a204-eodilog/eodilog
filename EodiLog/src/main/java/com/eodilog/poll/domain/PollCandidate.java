package com.eodilog.poll.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UuidGenerator;

// 지역 투표는 regionId만, 장소 투표는 placeId만 가진다. 같은 투표에 같은 후보는 한 번만 들어간다
@Entity
@Table(name = "poll_candidates")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PollCandidate {

	@Id
	@UuidGenerator(style = UuidGenerator.Style.VERSION_7)
	private UUID id;

	private UUID pollId;

	private UUID regionId;

	private UUID placeId;

	// 입력·추가한 순서(0부터). 같은 시각에 함께 만든 후보도 입력 순서를 지킨다
	private int displayOrder;

	// 마감 때 고정한 득표 수. OPEN 동안은 null
	private Integer voteCount;

	private Instant createdAt;

	public static PollCandidate of(UUID pollId, PollType type, UUID targetId, int displayOrder, Instant now) {
		PollCandidate candidate = new PollCandidate();
		candidate.pollId = pollId;
		if (type == PollType.REGION) {
			candidate.regionId = targetId;
		} else {
			candidate.placeId = targetId;
		}
		candidate.displayOrder = displayOrder;
		candidate.createdAt = now;
		return candidate;
	}

	// 유형에 맞는 쪽의 ID. 중복 후보 판정에 쓴다
	public UUID targetId() {
		return regionId != null ? regionId : placeId;
	}

	public void fixVoteCount(int voteCount) {
		this.voteCount = voteCount;
	}

}
