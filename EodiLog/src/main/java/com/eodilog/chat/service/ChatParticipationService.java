package com.eodilog.chat.service;

import com.eodilog.chat.domain.ChatParticipantId;
import com.eodilog.chat.domain.ChatRoom;
import com.eodilog.chat.repository.ChatParticipantRepository;
import com.eodilog.chat.repository.ChatRoomRepository;
import java.time.Instant;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

// 채팅 참여를 여행 멤버십과 맞춘다(D-11). 멤버십을 바꾸는 트랜잭션 안에서만 호출한다
@Service
@RequiredArgsConstructor
public class ChatParticipationService {

	private final ChatRoomRepository chatRoomRepository;
	private final ChatParticipantRepository chatParticipantRepository;

	@Transactional(propagation = Propagation.MANDATORY)
	public void leaveTripRoom(UUID tripId, UUID userId, Instant now) {
		// 여행 생성 때 채팅방과 멤버 참여를 함께 만들므로 없으면 자료 오류다
		ChatRoom room = chatRoomRepository.findByTripId(tripId)
				.orElseThrow(() -> new IllegalStateException("Trip has no chat room: " + tripId));
		chatParticipantRepository.findById(new ChatParticipantId(room.getId(), userId))
				.orElseThrow(() -> new IllegalStateException("Trip member is not a chat participant: " + userId))
				.leave(now);
	}

}
