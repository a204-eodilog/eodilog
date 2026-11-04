package com.eodilog.notification;

import java.time.Instant;
import java.util.UUID;

public record NotificationView(UUID id, UUID eventId, String kind, String message,
        Target target, Instant readAt, Instant createdAt) {
    public record Target(String type, UUID id) { }
}
