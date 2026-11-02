package com.eodilog.chat.repository;

import com.eodilog.chat.domain.ChatRoom;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ChatRoomRepository extends JpaRepository<ChatRoom, UUID> {

	Optional<ChatRoom> findByTripId(UUID tripId);

	// 메시지 순번을 발급할 때 잡는다. 같은 방의 전송은 이 잠금으로 순서가 정해진다
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select r from ChatRoom r where r.id = :id")
	Optional<ChatRoom> findByIdForUpdate(@Param("id") UUID id);

}
