package com.eodilog.job;

import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

@Component
public class JobWorker {
    private final JobStore store;
    private final JobRegistry registry;
    private final JobProperties properties;
    private final Clock clock;
    private final TransactionTemplate tx;
    private final ThreadPoolExecutor executor;
    private final ScheduledExecutorService scheduler;
    private final Map<UUID, Execution> running = new ConcurrentHashMap<>();
    // A slot is held from claim until the execution thread actually returns, so claims never outrun threads.
    private final Semaphore slots;
    private volatile boolean closing;
    private static final Duration SHUTDOWN_GRACE = Duration.ofSeconds(5);

    private static final class Execution {
        final JobContext context;
        final Instant deadline;
        volatile Instant nextHeartbeat;
        FutureTask<Void> task;
        Execution(JobContext context, Instant now, JobProperties p) {
            this.context = context; deadline = now.plus(p.timeout()); nextHeartbeat = now.plus(p.heartbeat());
        }
    }
    public JobWorker(JobStore store, JobRegistry registry, JobProperties properties, Clock clock, PlatformTransactionManager manager) {
        this.store = store; this.registry = registry; this.properties = properties; this.clock = clock;
        tx = new TransactionTemplate(manager);
        tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        executor = new ThreadPoolExecutor(properties.concurrency(), properties.concurrency(), 0, TimeUnit.MILLISECONDS,
            new LinkedBlockingQueue<>(), r -> { var t = new Thread(r, "job-execution"); t.setDaemon(true); return t; });
        slots = new Semaphore(properties.concurrency());
        scheduler = Executors.newSingleThreadScheduledExecutor(r -> { var t = new Thread(r, "job-poll"); t.setDaemon(true); return t; });
    }
    @PostConstruct
    void start() {
        // Each step is isolated so one failure cannot skip the other or silently stop the schedule.
        // Never log payloads or database messages; the next poll retries.
        if (properties.enabled()) scheduler.scheduleWithFixedDelay(() -> {
            try { tick(); } catch (Throwable ignored) { }
            try { pollOnce(); } catch (Throwable ignored) { }
        }, properties.polling().toMillis(), properties.polling().toMillis(), TimeUnit.MILLISECONDS);
    }
    /** Claims at most one job, in a transaction independent of any caller transaction. */
    public synchronized boolean pollOnce() {
        if (closing || !slots.tryAcquire()) return false;
        Optional<JobStore.Row> row = null;
        try { row = tx.execute(s -> store.claim(clock.instant(), properties, registry.kinds())); }
        finally { if (row == null || row.isEmpty()) slots.release(); }
        if (row.isEmpty()) return false;
        var c = row.get().context();
        var execution = new Execution(c, clock.instant(), properties);
        execution.task = new FutureTask<>(() -> {
            try {
                boolean allowed = Boolean.TRUE.equals(tx.execute(s -> permitted(c, false)));
                JobOutcome outcome;
                if (!allowed) outcome = JobOutcome.failed(JobFailure.POLICY_REVOKED);
                else outcome = registry.handler(c.submission().kind()).execute(c);
                finish(c, outcome);
            } catch (Exception ignored) {
                // Exception messages may contain external payloads or credentials.
                // An execution interrupted by shutdown is left RUNNING so lease expiry re-claims it.
                if (!closing) failSafely(c, JobFailure.EXECUTION_FAILED);
            } finally { running.remove(c.executionId(), execution); }
            return null;
        });
        running.put(c.executionId(), execution);
        // The wrapper releases the slot even when the task was cancelled before it started.
        try { executor.execute(() -> { try { execution.task.run(); } finally { slots.release(); } }); }
        catch (RejectedExecutionException ignored) {
            // Only possible during shutdown. Nothing ran, so the claim and its attempt are returned.
            running.remove(c.executionId(), execution);
            slots.release();
            try { tx.executeWithoutResult(s -> store.unclaim(c)); } catch (RuntimeException unclaimFailed) { /* Lease recovery. */ }
        }
        return true;
    }
    private boolean permitted(JobContext c, boolean completion) {
        var kind = c.submission().kind();
        if (!registry.enabled(kind)) return false;
        // Cleanup continues with its original authorization even after requester deactivation.
        if (!kind.cleanup() && !store.active(c.submission().requestedByUserId())) return false;
        var policy = registry.policy(kind);
        return completion ? policy.canComplete(c) : policy.canExecute(c);
    }
    /** Manual clock-driven maintenance is also used by tests; no long sleeps are needed. */
    public void tick() {
        var now = clock.instant();
        for (var e : running.values()) {
            if (!now.isBefore(e.deadline)) {
                failSafely(e.context, JobFailure.TIMEOUT);
                e.task.cancel(true);
                running.remove(e.context.executionId(), e);
            } else if (!now.isBefore(e.nextHeartbeat)) {
                boolean alive = Boolean.TRUE.equals(tx.execute(s -> store.heartbeat(e.context, now, properties)));
                if (!alive) { e.task.cancel(true); running.remove(e.context.executionId(), e); }
                e.nextHeartbeat = now.plus(properties.heartbeat());
            }
        }
    }
    private void failSafely(JobContext c, JobFailure failure) {
        try { finish(c, JobOutcome.failed(failure)); } catch (RuntimeException ignored) { /* Lease recovery handles a lost DB connection. */ }
    }
    /** Locks and verifies execution identity and lease before calling any domain completion hook. */
    public boolean finish(JobContext c, JobOutcome outcome) {
        return Boolean.TRUE.equals(tx.execute(s -> {
            var row = store.find(c.jobId(), true);
            var now = clock.instant();
            if (row.isEmpty() || row.get().status() != JobStatus.RUNNING
                || !Objects.equals(row.get().context().executionId(), c.executionId())
                || !row.get().leaseUntil().isAfter(now)) return false;
            if (!permitted(c, true)) {
                store.failure(c, JobFailure.POLICY_REVOKED, now, properties);
            } else if (outcome.failure() != null) {
                store.failure(c, outcome.failure(), now, properties);
            } else if (!now.isBefore(row.get().executionStartedAt().plus(properties.timeout()))) {
                store.failure(c, JobFailure.TIMEOUT, now, properties);
            } else {
                var result = c.submission().kind().cleanup() ? JobService.cleanupResult(outcome.result()) : outcome.result();
                if (c.submission().kind().cleanup() && !result.path("scope").asString().equals(c.submission().kind().name()))
                    throw new IllegalArgumentException("Cleanup result kind mismatch");
                registry.handler(c.submission().kind()).complete(c, result);
                // The hook and job result share this transaction; either both commit or both roll back.
                store.success(c, result, now);
            }
            return true;
        }));
    }
    @PreDestroy
    public void close() {
        closing = true; scheduler.shutdownNow(); executor.shutdownNow();
        // Let interrupted executions record a normal result before the DataSource closes.
        try { awaitTermination(SHUTDOWN_GRACE); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }
    boolean awaitTermination(Duration timeout) throws InterruptedException {
        return executor.awaitTermination(timeout.toMillis(), TimeUnit.MILLISECONDS);
    }
}
