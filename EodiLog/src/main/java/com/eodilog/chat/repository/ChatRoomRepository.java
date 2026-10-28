package com.eodilog.chat.repository;

import com.eodilog.chat.domain.ChatRoom;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChatRoomRepository extends JpaRepository<ChatRoom, UUID> {

	Optional<ChatRoom> findByTripId(UUID tripId);

}
