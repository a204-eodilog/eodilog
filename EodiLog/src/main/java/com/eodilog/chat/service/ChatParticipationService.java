package com.eodilog.chat.service;

import com.eodilog.chat.domain.ChatParticipant;
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

	// 초대 수락으로 처음 들어오면 참여 행을 만들고, 나갔다 돌아오면 같은 행의 이탈 표시를 지운다
	@Transactional(propagation = Propagation.MANDATORY)
	public void joinTripRoom(UUID tripId, UUID userId, Instant now) {
		ChatRoom room = chatRoomRepository.findByTripId(tripId)
				.orElseThrow(() -> new IllegalStateException("Trip has no chat room: " + tripId));
		chatParticipantRepository.findById(new ChatParticipantId(room.getId(), userId))
				.ifPresentOrElse(participant -> participant.rejoin(now),
						() -> chatParticipantRepository.save(ChatParticipant.join(room.getId(), userId, now)));
	}

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
