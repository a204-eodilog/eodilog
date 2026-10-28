package com.eodilog.chat.service;

import com.eodilog.chat.domain.ChatParticipant;
import com.eodilog.chat.domain.ChatRoom;
import com.eodilog.chat.repository.ChatParticipantRepository;
import com.eodilog.chat.repository.ChatRoomRepository;
import java.time.Instant;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

// 여행 생성 트랜잭션 안에서만 호출한다. 실패하면 여행 생성 전체가 롤백된다
@Service
@RequiredArgsConstructor
public class ChatRoomInitializer {

	private final ChatRoomRepository chatRoomRepository;
	private final ChatParticipantRepository chatParticipantRepository;

	@Transactional(propagation = Propagation.MANDATORY)
	public ChatRoom openTripRoom(UUID tripId, UUID ownerUserId, Instant now) {
		ChatRoom room = chatRoomRepository.save(ChatRoom.open(tripId, now));
		chatParticipantRepository.save(ChatParticipant.join(room.getId(), ownerUserId, now));
		return room;
	}

}
