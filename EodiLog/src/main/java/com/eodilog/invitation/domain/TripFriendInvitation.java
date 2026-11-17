package com.eodilog.invitation.domain;

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

// 맞팔 친구에게 앱 안에서 보낸 여행 초대 하나. 받은 사람이 수락해야 여행에 참여한다
@Entity
@Table(name = "trip_friend_invitations")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TripFriendInvitation {

	@Id
	@UuidGenerator(style = UuidGenerator.Style.VERSION_7)
	private UUID id;

	private UUID tripId;

	private UUID inviterMemberId;

	private UUID inviteeUserId;

	@Enumerated(EnumType.STRING)
	private TripFriendInvitationStatus status;

	private Instant expiresAt;

	private Instant createdAt;

	private Instant respondedAt;

	public static TripFriendInvitation create(UUID tripId, UUID inviterMemberId, UUID inviteeUserId,
			Instant expiresAt, Instant now) {
		TripFriendInvitation invitation = new TripFriendInvitation();
		invitation.tripId = tripId;
		invitation.inviterMemberId = inviterMemberId;
		invitation.inviteeUserId = inviteeUserId;
		invitation.status = TripFriendInvitationStatus.PENDING;
		invitation.expiresAt = expiresAt;
		invitation.createdAt = now;
		return invitation;
	}

	public boolean isPending() {
		return status == TripFriendInvitationStatus.PENDING;
	}

	// 링크와 같이 만료 시각부터 쓸 수 없다
	public boolean isExpiredAt(Instant now) {
		return !now.isBefore(expiresAt);
	}

	public void accept(Instant now) {
		respond(TripFriendInvitationStatus.ACCEPTED, now);
	}

	public void decline(Instant now) {
		respond(TripFriendInvitationStatus.DECLINED, now);
	}

	public void cancel(Instant now) {
		respond(TripFriendInvitationStatus.CANCELED, now);
	}

	// 대기 중인 초대만 바뀐다. 이미 처리된 초대는 그대로 둔다
	private void respond(TripFriendInvitationStatus next, Instant now) {
		if (!isPending()) return;
		this.status = next;
		this.respondedAt = now;
	}

}
