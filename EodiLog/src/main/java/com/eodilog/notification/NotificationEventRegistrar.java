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
        // 받는 사람이 설정에서 끈 종류는 알림 행을 만들지 않는다. 이벤트 행은 남는다(채팅 시스템 카드가 쓸 수 있다).
        // 설정 행이 아직 없으면 기본값(켜짐)이다. 만드는 시점의 설정을 보므로 나중에 꺼도 이미 받은 알림은 남는다
        boolean voteCourse = usesVoteCourseSetting(command.type());
        boolean tripChanges = usesTripChangesSetting(command.type());
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
                      AND NOT EXISTS (
                          SELECT 1 FROM user_settings s WHERE s.user_id=u.id
                            AND ((? AND NOT s.vote_course_enabled) OR (? AND NOT s.trip_changes_enabled)))
                    ON CONFLICT(recipient_user_id,event_id) DO NOTHING
                    """, notificationId, eventId, now, recipient, command.tripId(), command.tripId(),
                    voteCourse, tripChanges);
        }
        return eventId;
    }

    // 설정 "투표·코스 소식"(user_settings.vote_course_enabled)을 따르는 종류
    private static boolean usesVoteCourseSetting(String type) {
        return type.startsWith("POLL_") || type.equals("COURSE_CHANGED");
    }

    // 설정 "여행 소식"(user_settings.trip_changes_enabled)을 따르는 종류.
    // FEED_DELETED(FeedService)와 팔로우 알림(FollowNotifier)은 부르는 쪽이 받는 사람을 고를 때 이미 설정을 본다
    private static boolean usesTripChangesSetting(String type) {
        return type.equals("TRIP_INFO_CHANGED") || type.equals("TRIP_MEMBER_JOINED");
    }
}
