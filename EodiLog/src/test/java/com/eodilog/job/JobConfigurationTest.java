package com.eodilog.job;

import static org.assertj.core.api.Assertions.*;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class JobConfigurationTest {
    @Test void emptyRegistryStartsWithoutFakeHandlers() {
        var registry = new JobRegistry(List.of(), List.of());
        assertThat(registry.enabled(JobKind.PLACE_EXTRACTION)).isFalse();
        assertThatThrownBy(() -> registry.handler(JobKind.PLACE_EXTRACTION)).isInstanceOf(IllegalStateException.class);
    }
    @Test void inconsistentConfigurationFailsAtStartup() {
        new ApplicationContextRunner().withUserConfiguration(JobConfiguration.class)
            .withPropertyValues("app.jobs.polling=1s", "app.jobs.timeout=60s", "app.jobs.lease=30s", "app.jobs.heartbeat=20s",
                "app.jobs.retry-delay=30s", "app.jobs.max-attempts=3", "app.jobs.batch-size=1", "app.jobs.concurrency=2")
            .run(context -> assertThat(context).hasFailed());
    }
    @Test void unsupportedAttemptsOrBatchFailsAtStartup() {
        new ApplicationContextRunner().withUserConfiguration(JobConfiguration.class)
            .withPropertyValues("app.jobs.polling=1s", "app.jobs.timeout=60s", "app.jobs.lease=120s", "app.jobs.heartbeat=20s",
                "app.jobs.retry-delay=30s", "app.jobs.max-attempts=4", "app.jobs.batch-size=2", "app.jobs.concurrency=2")
            .run(context -> assertThat(context).hasFailed());
    }
}
