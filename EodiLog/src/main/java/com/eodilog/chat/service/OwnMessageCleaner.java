package com.eodilog.chat.service;

import java.sql.PreparedStatement;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

// 나가기 '내 채팅 삭제'(D-10, 정책 §15). 메시지 행과 순번은 남기고 본문만 지운다(text NULL + deleted_at)
// 대상은 나가기 트랜잭션에서 고정하고(LEAVE_CLEANUP 작업의 cleanupScope), 지우기는 작업 완료 트랜잭션에서 한다
@Component
@RequiredArgsConstructor
public class OwnMessageCleaner {

	private final JdbcTemplate jdbcTemplate;

	// 이 여행 채팅방에서 내가 보냈고 아직 지우지 않은 일반 메시지. 순번 순
	@Transactional(propagation = Propagation.MANDATORY)
	public List<UUID> findOwnMessageIds(UUID tripId, UUID senderUserId) {
		return jdbcTemplate.queryForList("""
				select m.id from messages m join chat_rooms r on r.id = m.room_id
				where r.trip_id = ? and m.sender_user_id = ? and m.type = 'TEXT' and m.deleted_at is null
				order by m.sequence""", UUID.class, tripId, senderUserId);
	}

	// 고정한 ID 중 보낸 사람이 같고 아직 지우지 않은 것만 지운다. 이미 지운 행(여행 삭제로 사라진 행 포함)은 건너뛰므로 멱등하다
	@Transactional(propagation = Propagation.MANDATORY)
	public int removeBodies(Collection<UUID> messageIds, UUID senderUserId, Instant now) {
		if (messageIds.isEmpty()) {
			return 0;
		}
		return jdbcTemplate.update(connection -> {
			PreparedStatement statement = connection.prepareStatement("""
					update messages set text = null, deleted_at = ?
					where id = any(?) and sender_user_id = ? and type = 'TEXT' and deleted_at is null""");
			statement.setObject(1, OffsetDateTime.ofInstant(now, ZoneOffset.UTC));
			statement.setArray(2, connection.createArrayOf("uuid", messageIds.toArray()));
			statement.setObject(3, senderUserId);
			return statement;
		});
	}

}
