package com.eodilog.itinerary.service;

import com.eodilog.itinerary.domain.Itinerary;
import com.eodilog.notification.NotificationEventRegistrar;
import com.eodilog.notification.NotificationEventRegistrar.EventCommand;
import com.eodilog.trip.repository.TripMemberRepository;
import com.eodilog.user.dto.UserCard;
import com.eodilog.user.service.UserCardReader;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

// 코스 version이 실제로 오른 저장마다 다른 멤버에게 알린다(COURSE_CHANGED, 명세 §9). 연속 저장을 묶지 않는다
@Component
public class ItineraryNotifier {

	// 닉네임을 읽지 못해도 알림은 남긴다
	static final String FALLBACK_NICKNAME = "동행";

	private final NotificationEventRegistrar registrar;
	private final TripMemberRepository tripMemberRepository;
	private final UserCardReader userCardReader;

	public ItineraryNotifier(NotificationEventRegistrar registrar, TripMemberRepository tripMemberRepository,
			UserCardReader userCardReader) {
		this.registrar = registrar;
		this.tripMemberRepository = tripMemberRepository;
		this.userCardReader = userCardReader;
	}

	// version을 올린 뒤 부른다. 저장한 본인은 받지 않는다
	@Transactional(propagation = Propagation.MANDATORY)
	public void courseChanged(Itinerary itinerary, UUID actorUserId) {
		UUID tripId = itinerary.getTripId();
		List<UUID> recipients = tripMemberRepository.findActiveUserIds(tripId).stream()
				.filter(id -> !id.equals(actorUserId))
				.toList();
		registrar.register(new EventCommand("COURSE_CHANGED", tripId, actorUserId, "ITINERARY", tripId,
				nickname(actorUserId) + "님이 코스를 수정했어요.", "COURSE_CHANGED:" + tripId + ":" + itinerary.getVersion()),
				recipients);
	}

	private String nickname(UUID userId) {
		UserCard card = userCardReader.findCards(userId, List.of(userId)).get(userId);
		return card == null || card.nickname() == null || card.nickname().isBlank()
				? FALLBACK_NICKNAME : card.nickname();
	}

}
