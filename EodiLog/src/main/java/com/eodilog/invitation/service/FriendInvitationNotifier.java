package com.eodilog.invitation.service;

import com.eodilog.invitation.domain.TripFriendInvitation;
import com.eodilog.notification.NotificationEventRegistrar;
import com.eodilog.notification.NotificationEventRegistrar.EventCommand;
import com.eodilog.trip.domain.Trip;
import com.eodilog.user.dto.UserCard;
import com.eodilog.user.service.UserCardReader;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

// 앱 내 친구 초대를 받은 사람에게 알린다(TRIP_INVITED). 해야 할 일이 있는 알림이라 알림 설정과 상관없이 보낸다.
// tripId를 넣으면 등록기가 받는 사람을 그 여행의 ACTIVE 멤버로 거르므로(아직 멤버가 아님) 반드시 null로 둔다
@Component
public class FriendInvitationNotifier {

	static final String TYPE = "TRIP_INVITED";
	static final String TARGET_TYPE = "TRIP_INVITATION";
	static final String FALLBACK_NICKNAME = "동행";

	private final NotificationEventRegistrar registrar;
	private final UserCardReader userCardReader;

	public FriendInvitationNotifier(NotificationEventRegistrar registrar, UserCardReader userCardReader) {
		this.registrar = registrar;
		this.userCardReader = userCardReader;
	}

	// 새 초대를 저장한 뒤 부른다. 다시 보내 기존 대기 초대를 돌려줄 때는 부르지 않는다
	@Transactional(propagation = Propagation.MANDATORY)
	public void invited(TripFriendInvitation invitation, UUID inviterUserId, Trip trip) {
		registrar.register(new EventCommand(TYPE, null, inviterUserId, TARGET_TYPE, invitation.getId(),
				nickname(inviterUserId) + "님이 '" + trip.getTitle() + "' 여행에 초대했어요.",
				TYPE + ":" + invitation.getId()), List.of(invitation.getInviteeUserId()));
	}

	private String nickname(UUID userId) {
		UserCard card = userCardReader.findCards(userId, List.of(userId)).get(userId);
		return card == null || card.nickname() == null || card.nickname().isBlank()
				? FALLBACK_NICKNAME : card.nickname();
	}

}
