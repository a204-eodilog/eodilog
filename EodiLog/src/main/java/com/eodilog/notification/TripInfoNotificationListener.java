package com.eodilog.notification;

import com.eodilog.trip.domain.TripInfoChangedEvent;
import java.util.UUID;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class TripInfoNotificationListener {
    private final JdbcTemplate jdbc;
    private final NotificationEventRegistrar registrar;
    public TripInfoNotificationListener(JdbcTemplate jdbc, NotificationEventRegistrar registrar) {
        this.jdbc = jdbc; this.registrar = registrar;
    }

    // 동기 리스너: 여행 수정과 이벤트·알림 저장이 같은 업무 트랜잭션에서 커밋된다.
    @EventListener
    public void on(TripInfoChangedEvent changed) {
        var recipients = jdbc.query("""
                SELECT m.user_id FROM trip_members m JOIN trips t ON t.id=m.trip_id
                WHERE m.trip_id=? AND m.status='ACTIVE' AND t.deleted_at IS NULL
                  AND (?::uuid IS NULL OR m.user_id<>?)
                """, (rs, row) -> rs.getObject(1, UUID.class), changed.tripId(), changed.actorUserId(),
                changed.actorUserId());
        registrar.register(new NotificationEventRegistrar.EventCommand("TRIP_INFO_CHANGED", changed.tripId(),
                changed.actorUserId(), "TRIP", changed.tripId(), "여행 정보가 변경되었습니다.",
                "TRIP_INFO_CHANGED:"+changed.tripId()+":"+changed.version()), recipients);
    }
}
