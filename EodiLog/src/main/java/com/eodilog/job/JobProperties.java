package com.eodilog.job;

import java.time.Duration;
import jakarta.validation.constraints.*;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("app.jobs")
public record JobProperties(boolean enabled, @NotNull Duration polling, @NotNull Duration timeout,
    @NotNull Duration lease, @NotNull Duration heartbeat, @Min(1) @Max(3) int maxAttempts,
    @NotNull Duration retryDelay, @Min(1) @Max(1) int batchSize, @Min(1) @Max(32) int concurrency) {
    public JobProperties {
        if (polling == null || timeout == null || lease == null || heartbeat == null || retryDelay == null
            || polling.toMillis() < 1 || timeout.toMillis() < 1 || heartbeat.toMillis() < 1
            || retryDelay.isNegative() || lease.compareTo(timeout) <= 0 || heartbeat.compareTo(timeout) >= 0
            || polling.compareTo(heartbeat) > 0)
            throw new IllegalArgumentException("Invalid jobs timing configuration");
    }
}
