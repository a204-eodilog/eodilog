package com.eodilog.trip.domain;

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

// 역할(OWNER/MEMBER)은 저장하지 않고 trips.owner_user_id와 비교해 계산한다
@Entity
@Table(name = "trip_members")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TripMember {

	@Id
	@UuidGenerator(style = UuidGenerator.Style.VERSION_7)
	private UUID id;

	private UUID tripId;

	private UUID userId;

	@Enumerated(EnumType.STRING)
	private TripMemberStatus status;

	private long joinOrder;

	private Instant joinedAt;

	private Instant leftAt;

	public static TripMember join(UUID tripId, UUID userId, long joinOrder, Instant now) {
		TripMember member = new TripMember();
		member.tripId = tripId;
		member.userId = userId;
		member.status = TripMemberStatus.ACTIVE;
		member.joinOrder = joinOrder;
		member.joinedAt = now;
		return member;
	}

	public boolean isActive() {
		return status == TripMemberStatus.ACTIVE;
	}

	// 경비 FK 때문에 행은 지우지 않는다(ERD). 재참여는 이 행을 다시 쓴다
	public void remove(Instant now) {
		this.status = TripMemberStatus.REMOVED;
		this.leftAt = now;
	}

	// 스스로 나간다. 내보내기(REMOVED)와 구분하며, 행은 남겨 경비·정산에서 과거 멤버로 보인다
	public void leave(Instant now) {
		this.status = TripMemberStatus.LEFT;
		this.leftAt = now;
	}

	// 나간·내보낸 멤버가 초대로 돌아오면 멤버십 ID는 유지하고 참여 순번을 새로 받는다(ERD trip_members 노트)
	public void rejoin(long joinOrder, Instant now) {
		this.status = TripMemberStatus.ACTIVE;
		this.joinOrder = joinOrder;
		this.joinedAt = now;
		this.leftAt = null;
	}

}
