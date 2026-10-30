package com.eodilog.global.id;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.HashSet;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

class UuidV7Test {
    @Test
    void timestampMatchesGenerationTime() {
        long before = Instant.now().toEpochMilli();
        UUID id = UuidV7.generate();
        long after = Instant.now().toEpochMilli();

        assertThat(id.version()).isEqualTo(7);
        assertThat(id.variant()).isEqualTo(2);
        assertThat(id.getMostSignificantBits() >>> 16).isBetween(before, after);
    }

    @Test
    void concurrentCallsProduceUniqueVersion7Ids() throws Exception {
        var tasks = IntStream.range(0, 4096)
                .mapToObj(index -> (Callable<UUID>) UuidV7::generate).toList();
        var ids = new HashSet<UUID>();
        try (var executor = Executors.newFixedThreadPool(8)) {
            for (var result : executor.invokeAll(tasks)) {
                UUID id = result.get();
                assertThat(id.version()).isEqualTo(7);
                assertThat(id.variant()).isEqualTo(2);
                assertThat(ids.add(id)).isTrue();
            }
        }
        assertThat(ids).hasSize(tasks.size());
    }
}
