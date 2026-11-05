package com.eodilog.invitation.service;

import com.eodilog.notification.NotificationEventRegistrar;
import com.eodilog.notification.NotificationEventRegistrar.EventCommand;
import com.eodilog.trip.domain.TripMember;
import com.eodilog.trip.repository.TripMemberRepository;
import com.eodilog.user.dto.UserCard;
import com.eodilog.user.service.UserCardReader;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

// 초대 수락으로 새 멤버가 생겼을 때 기존 멤버에게 알린다(TRIP_MEMBER_JOINED, 명세 §9)
// 재참여는 새 참여 순번을 받으므로 키가 달라 다시 알린다. 이미 ACTIVE라 변화가 없는 수락은 부르지 않는다
@Component
public class InvitationNotifier {

	// 닉네임을 읽지 못해도 알림은 남긴다
	static final String FALLBACK_NICKNAME = "동행";

	private final NotificationEventRegistrar registrar;
	private final TripMemberRepository tripMemberRepository;
	private final UserCardReader userCardReader;

	public InvitationNotifier(NotificationEventRegistrar registrar, TripMemberRepository tripMemberRepository,
			UserCardReader userCardReader) {
		this.registrar = registrar;
		this.tripMemberRepository = tripMemberRepository;
		this.userCardReader = userCardReader;
	}

	// 멤버십을 바꾼 뒤 부른다. 새 멤버 본인은 받지 않는다
	@Transactional(propagation = Propagation.MANDATORY)
	public void memberJoined(TripMember member) {
		UUID userId = member.getUserId();
		List<UUID> recipients = tripMemberRepository.findActiveUserIds(member.getTripId()).stream()
				.filter(id -> !id.equals(userId))
				.toList();
		registrar.register(new EventCommand("TRIP_MEMBER_JOINED", member.getTripId(), userId, "TRIP",
				member.getTripId(), nickname(userId) + "님이 여행에 참여했어요.",
				"TRIP_MEMBER_JOINED:" + member.getTripId() + ":" + member.getId() + ":" + member.getJoinOrder()),
				recipients);
	}

	private String nickname(UUID userId) {
		UserCard card = userCardReader.findCards(userId, List.of(userId)).get(userId);
		return card == null || card.nickname() == null || card.nickname().isBlank()
				? FALLBACK_NICKNAME : card.nickname();
	}

}
