package com.eodilog.job;

import java.util.UUID;
import tools.jackson.databind.JsonNode;

public record JobSubmission(UUID requestedByUserId, JobKind kind, UUID tripId,
                            JsonNode input, Long baseVersion, CleanupScope cleanupScope) {
    public JobSubmission {
        java.util.Objects.requireNonNull(requestedByUserId);
        java.util.Objects.requireNonNull(kind);
        if (input == null || !input.isObject()) throw new IllegalArgumentException("Job input must be an object");
        if (kind.cleanup() != (cleanupScope != null)) throw new IllegalArgumentException("Invalid cleanup scope");
        if (baseVersion != null && baseVersion < 1) throw new IllegalArgumentException("Invalid base version");
        input = input.deepCopy();
    }
}
