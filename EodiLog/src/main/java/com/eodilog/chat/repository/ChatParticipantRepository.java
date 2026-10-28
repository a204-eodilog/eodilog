package com.eodilog.chat.repository;

import com.eodilog.chat.domain.ChatParticipant;
import com.eodilog.chat.domain.ChatParticipantId;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChatParticipantRepository extends JpaRepository<ChatParticipant, ChatParticipantId> {

	List<ChatParticipant> findAllByRoomId(UUID roomId);

}
