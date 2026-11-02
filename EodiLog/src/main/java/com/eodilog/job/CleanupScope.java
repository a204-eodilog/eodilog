package com.eodilog.job;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Immutable targets captured by the authorizing domain transaction. Never search for new targets on retry. */
public record CleanupScope(List<UUID> photoIds, List<UUID> messageIds, Instant cutoffAt) {
    public CleanupScope {
        photoIds = List.copyOf(photoIds);
        messageIds = List.copyOf(messageIds);
        java.util.Objects.requireNonNull(cutoffAt);
    }
}
