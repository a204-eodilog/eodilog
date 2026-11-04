package com.eodilog.notification;

import com.eodilog.global.id.UuidV7;
import java.sql.Timestamp;
import java.time.Clock;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** B 도메인은 업무 트랜잭션 안에서 호출한다. 등록과 업무 데이터가 함께 커밋·롤백된다. */
@Service
public class NotificationEventRegistrar {
    private final JdbcTemplate jdbc;
    private final Clock clock;

    public NotificationEventRegistrar(JdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    public record EventCommand(String type, UUID tripId, UUID actorUserId, String targetType,
            UUID targetId, String message, String deduplicationKey) { }

    @Transactional(propagation = Propagation.MANDATORY)
    public UUID register(EventCommand command, Collection<UUID> recipientUserIds) {
        if (command == null || command.type() == null || command.type().isBlank()
                || command.type().length() > 64 || command.targetType() == null || command.targetType().isBlank()
                || command.targetType().length() > 32 || command.targetId() == null
                || command.message() == null || command.message().isBlank()
                || command.deduplicationKey() == null || command.deduplicationKey().isBlank()
                || command.deduplicationKey().length() > 255 || recipientUserIds == null)
            throw new IllegalArgumentException("Invalid event registration");
        UUID candidate = UuidV7.generate();
        Timestamp now = Timestamp.from(clock.instant());
        var created = jdbc.query("""
                INSERT INTO events(id,type,trip_id,actor_user_id,target_type,target_id,payload_json,deduplication_key,created_at)
                VALUES(?,?,?,?,?, ?,jsonb_build_object('message',?),?,?)
                ON CONFLICT(deduplication_key) DO NOTHING RETURNING id
                """, (rs, row) -> rs.getObject(1, UUID.class), candidate, command.type(), command.tripId(),
                command.actorUserId(), command.targetType(), command.targetId(), command.message(),
                command.deduplicationKey(), now);
        if (created.isEmpty())
            return jdbc.queryForObject("SELECT id FROM events WHERE deduplication_key=?", UUID.class,
                    command.deduplicationKey());
        UUID eventId = created.getFirst();
        for (UUID recipient : new LinkedHashSet<>(recipientUserIds)) {
            if (recipient == null) continue;
            UUID notificationId = UuidV7.generate();
            jdbc.update("""
                    INSERT INTO notifications(id,recipient_user_id,event_id,created_at)
                    SELECT ?,u.id,?,? FROM users u
                    WHERE u.id=? AND u.status='ACTIVE' AND u.profile_completed=true
                      AND (?::uuid IS NULL OR EXISTS (
                          SELECT 1 FROM trip_members m JOIN trips t ON t.id=m.trip_id
                          WHERE m.trip_id=? AND m.user_id=u.id AND m.status='ACTIVE' AND t.deleted_at IS NULL))
                    ON CONFLICT(recipient_user_id,event_id) DO NOTHING
                    """, notificationId, eventId, now, recipient, command.tripId(), command.tripId());
        }
        return eventId;
    }
}
