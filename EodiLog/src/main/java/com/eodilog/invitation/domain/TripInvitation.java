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

// 초대 링크 하나. 원문 토큰은 저장하지 않고 해시로만 찾는다. 링크별 사용 횟수 없이 만료·무효화 전이면 여러 명이 쓸 수 있다
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

	// 같은 여행에 새 링크를 발급하거나 링크를 취소하면 채운다. 채워진 링크는 만료 전이라도 쓸 수 없다
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

	// 만료 시각부터 쓸 수 없다(명세 §4 "만료 시각부터 참여할 수 없다")
	public boolean isExpiredAt(Instant now) {
		return !now.isBefore(expiresAt);
	}

}
