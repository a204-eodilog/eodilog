package com.eodilog.invitation.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UuidGenerator;

// 초대 링크 하나. 원문 토큰은 저장하지 않고 해시로만 찾는다. 링크별 사용 횟수 없이 만료 전이면 여러 명이 쓸 수 있다
@Entity
@Table(name = "trip_invitations")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TripInvitation {

	@Id
	@UuidGenerator(style = UuidGenerator.Style.VERSION_7)
	private UUID id;

	private UUID tripId;

	private UUID createdByMemberId;

	private String tokenHash;

	private Instant expiresAt;

	// 취소 API는 아직 없다. 생기면 이 값으로 링크를 막는다
	private Instant revokedAt;

	private Instant createdAt;

	public static TripInvitation create(UUID tripId, UUID createdByMemberId, String tokenHash, Instant expiresAt,
			Instant now) {
		TripInvitation invitation = new TripInvitation();
		invitation.tripId = tripId;
		invitation.createdByMemberId = createdByMemberId;
		invitation.tokenHash = tokenHash;
		invitation.expiresAt = expiresAt;
		invitation.createdAt = now;
		return invitation;
	}

	public boolean isUsableAt(Instant now) {
		return revokedAt == null && now.isBefore(expiresAt);
	}

}
