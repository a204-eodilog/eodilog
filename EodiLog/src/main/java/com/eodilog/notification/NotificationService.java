package com.eodilog.notification;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.response.CreatedAtCursor;
import com.eodilog.global.common.response.PageResponse;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NotificationService {
    private static final String VISIBLE = """
            n.recipient_user_id=:userId AND
            (e.trip_id IS NULL OR EXISTS (
                SELECT 1 FROM trip_members tm JOIN trips t ON t.id=tm.trip_id
                WHERE tm.trip_id=e.trip_id AND tm.user_id=:userId AND tm.status='ACTIVE' AND t.deleted_at IS NULL))
            """;
    private static final String SELECT = """
            SELECT n.id,n.event_id,e.type,e.payload_json->>'message' AS message,e.target_type,e.target_id,
                   e.trip_id,n.read_at,n.created_at FROM notifications n JOIN events e ON e.id=n.event_id WHERE
            """;
    private final NamedParameterJdbcTemplate named;
    private final JdbcTemplate jdbc;
    private final Clock clock;

    public NotificationService(NamedParameterJdbcTemplate named, JdbcTemplate jdbc, Clock clock) {
        this.named = named; this.jdbc = jdbc; this.clock = clock;
    }

    public PageResponse<NotificationView> list(UUID userId, boolean unreadOnly, String cursor, int limit) {
        if (limit < 1 || limit > 100) throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
        CreatedAtCursor point = cursor == null ? null : CreatedAtCursor.decode(cursor);
        StringBuilder sql = new StringBuilder(SELECT).append(VISIBLE).append(" AND n.dismissed_at IS NULL");
        MapSqlParameterSource params = new MapSqlParameterSource("userId", userId).addValue("limit", limit + 1);
        if (unreadOnly) sql.append(" AND n.read_at IS NULL");
        if (point != null) {
            sql.append(" AND (n.created_at < :createdAt OR (n.created_at=:createdAt AND n.id<:cursorId))");
            params.addValue("createdAt", Timestamp.from(point.createdAt())).addValue("cursorId", point.id());
        }
        sql.append(" ORDER BY n.created_at DESC,n.id DESC LIMIT :limit");
        List<NotificationView> rows = named.query(sql.toString(), params, this::map);
        boolean hasNext = rows.size() > limit;
        List<NotificationView> page = new ArrayList<>(rows.subList(0, Math.min(limit, rows.size())));
        NotificationView last = page.isEmpty() ? null : page.getLast();
        String next = hasNext && last != null ? new CreatedAtCursor(last.createdAt(), last.id()).encode() : null;
        return PageResponse.of(page, next, hasNext);
    }

    @Transactional
    public NotificationView read(UUID userId, UUID notificationId) {
        NotificationView current = find(userId, notificationId, false, true);
        if (current.readAt() != null) return current;
        Instant when = clock.instant();
        jdbc.update("UPDATE notifications SET read_at=? WHERE id=? AND read_at IS NULL", Timestamp.from(when), notificationId);
        receipt(current.eventId(), userId, when);
        return new NotificationView(current.id(), current.eventId(), current.kind(), current.message(),
                current.target(), current.tripId(), when, current.createdAt());
    }

    @Transactional
    public void dismiss(UUID userId, UUID notificationId) {
        NotificationView current = find(userId, notificationId, true, true);
        jdbc.update("UPDATE notifications SET dismissed_at=COALESCE(dismissed_at,?) WHERE id=?",
                Timestamp.from(clock.instant()), current.id());
    }

    @Transactional
    public int readAll(UUID userId, Instant through) {
        Instant now = clock.instant();
        if (through == null || through.isAfter(now)) throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
        String sql = SELECT + VISIBLE + " AND n.dismissed_at IS NULL AND n.read_at IS NULL AND n.created_at<=:through FOR UPDATE OF n";
        var rows = named.query(sql, new MapSqlParameterSource("userId", userId)
                .addValue("through", Timestamp.from(through)), this::map);
        for (var row : rows) {
            jdbc.update("UPDATE notifications SET read_at=? WHERE id=?", Timestamp.from(now), row.id());
            receipt(row.eventId(), userId, now);
        }
        return rows.size();
    }

    @Transactional
    public Instant readEvent(UUID userId, UUID eventId) {
        var rows = named.query(SELECT + VISIBLE + " AND n.dismissed_at IS NULL AND n.event_id=:eventId FOR UPDATE OF n",
                new MapSqlParameterSource("userId", userId).addValue("eventId", eventId), this::map);
        if (rows.isEmpty()) throw new BusinessException(NotificationErrorCode.EVENT_NOT_FOUND);
        NotificationView item = rows.getFirst();
        if (item.readAt() != null) return item.readAt();
        Instant when = clock.instant();
        jdbc.update("UPDATE notifications SET read_at=? WHERE id=?", Timestamp.from(when), item.id());
        receipt(eventId, userId, when);
        return when;
    }

    public Summary summary(UUID userId) {
        Instant now = clock.instant();
        String sql = "SELECT count(*) FROM notifications n JOIN events e ON e.id=n.event_id WHERE " + VISIBLE
                + " AND n.dismissed_at IS NULL AND n.read_at IS NULL AND n.created_at<=:asOf";
        Long count = named.queryForObject(sql, new MapSqlParameterSource("userId", userId)
                .addValue("asOf", Timestamp.from(now)), Long.class);
        return new Summary(count == null ? 0 : count, now);
    }

    private NotificationView find(UUID userId, UUID id, boolean includeDismissed, boolean lock) {
        String sql = SELECT + VISIBLE + (includeDismissed ? "" : " AND n.dismissed_at IS NULL")
                + " AND n.id=:id" + (lock ? " FOR UPDATE OF n" : "");
        List<NotificationView> rows = named.query(sql, new MapSqlParameterSource("userId", userId)
                .addValue("id", id), this::map);
        if (rows.isEmpty()) throw new BusinessException(NotificationErrorCode.NOTIFICATION_NOT_FOUND);
        return rows.getFirst();
    }

    private void receipt(UUID eventId, UUID userId, Instant when) {
        jdbc.update("INSERT INTO event_receipts(event_id,user_id,read_at) VALUES(?,?,?) ON CONFLICT DO NOTHING",
                eventId, userId, Timestamp.from(when));
    }

    private NotificationView map(ResultSet rs, int row) throws SQLException {
        Timestamp read = rs.getTimestamp("read_at");
        return new NotificationView(rs.getObject("id", UUID.class), rs.getObject("event_id", UUID.class),
                rs.getString("type"), rs.getString("message"),
                new NotificationView.Target(rs.getString("target_type"), rs.getObject("target_id", UUID.class)),
                rs.getObject("trip_id", UUID.class),
                read == null ? null : read.toInstant(), rs.getTimestamp("created_at").toInstant());
    }

    public record Summary(long unreadCount, Instant asOf) { }
}
