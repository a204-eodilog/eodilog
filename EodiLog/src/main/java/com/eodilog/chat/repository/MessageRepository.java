package com.eodilog.chat.repository;

import com.eodilog.chat.domain.Message;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MessageRepository extends JpaRepository<Message, UUID> {

	// clientMessageId는 보낸 사람 단위로 유일하다(재전송 판별)
	Optional<Message> findBySenderUserIdAndClientMessageId(UUID senderUserId, UUID clientMessageId);

	List<Message> findByRoomIdOrderBySequenceDesc(UUID roomId, Limit limit);

	List<Message> findByRoomIdAndSequenceLessThanOrderBySequenceDesc(UUID roomId, long beforeSequence, Limit limit);

	// 방마다 가장 최근 메시지(채팅방 응답의 lastMessage)
	@Query("""
			select m from Message m
			where m.roomId in :roomIds
			and m.sequence = (select max(m2.sequence) from Message m2 where m2.roomId = m.roomId)""")
	List<Message> findLastMessages(@Param("roomIds") Collection<UUID> roomIds);

}
