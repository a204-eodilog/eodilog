package com.eodilog.job;

import static org.assertj.core.api.Assertions.*;
import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import java.util.concurrent.locks.LockSupport;
import java.util.function.Function;
import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.common.error.BusinessException;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.*;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.*;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, JobIntegrationTest.Fixtures.class})
class JobIntegrationTest {
    @Autowired JobService service;
    @Autowired JobStore store;
    @Autowired JobWorker worker;
    @Autowired JobProperties properties;
    @Autowired JobRegistry registry;
    @Autowired JdbcTemplate jdbc;
    @Autowired JsonMapper json;
    @Autowired PlatformTransactionManager manager;
    @Autowired MutableClock clock;
    @Autowired MockMvc mvc;
    @Autowired Fixtures fixtures;
    UUID user;
    TransactionTemplate tx;

    @BeforeEach void setUp() {
        jdbc.update("DELETE FROM jobs");
        tx = new TransactionTemplate(manager);
        clock.now = Instant.parse("2026-11-02T00:00:00Z");
        user = UUID.randomUUID();
        jdbc.update("INSERT INTO users(id,nickname,profile_completed,created_at,updated_at) VALUES (?,'original',true,now(),now())", user);
        fixtures.allowed.set(true);
        fixtures.readable.set(true);
        fixtures.completeAllowed.set(true);
        fixtures.hooks.set(0);
        fixtures.throwHook = false;
        fixtures.action = c -> JobOutcome.succeeded(json.readTree("{\"public\":true,\"private\":\"hidden\"}"));
    }
    JobSubmission submission(JobKind kind) {
        return new JobSubmission(user, kind, null, json.readTree("{\"allowed\":true}"), 1L,
            kind.cleanup() ? new CleanupScope(List.of(UUID.randomUUID()), List.of(), clock.instant()) : null);
    }
    UUID submit() { return submit(JobKind.PLACE_EXTRACTION); }
    UUID submit(JobKind kind) { return tx.execute(s -> service.submit(submission(kind))).jobId(); }
    JobContext claim() { return tx.execute(s -> store.claim(clock.instant(), properties, registry.kinds()).orElseThrow().context()); }
    String state(UUID id) { return jdbc.queryForObject("SELECT status FROM jobs WHERE id=?", String.class, id); }
    void awaitState(UUID id, String expected) {
        long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (!state(id).equals(expected) && System.nanoTime() < until) LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(5));
        assertThat(state(id)).isEqualTo(expected);
    }

    @Test void submissionRequiresWriteTransactionAndRegisteredKind() {
        assertThatThrownBy(() -> service.submit(submission(JobKind.PLACE_EXTRACTION))).isInstanceOf(IllegalTransactionStateException.class);
        assertThatThrownBy(() -> tx.execute(s -> service.submit(submission(JobKind.TRIP_RECOMMENDATION)))).isInstanceOf(IllegalStateException.class);
        tx.setReadOnly(true);
        assertThatThrownBy(() -> tx.execute(s -> service.submit(submission(JobKind.PLACE_EXTRACTION)))).isInstanceOf(IllegalStateException.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM jobs", Integer.class)).isZero();
    }
    @Test void domainRollbackAndUncommittedIsolation() throws Exception {
        try (var executor = Executors.newSingleThreadExecutor()) {
            tx.executeWithoutResult(s -> {
                var ref = service.submit(submission(JobKind.PLACE_EXTRACTION));
                assertThat(ref.jobId().version()).isEqualTo(7);
                assertThat(ref.statusUrl()).isEqualTo("/api/v1/jobs/" + ref.jobId());
                try { assertThat(executor.submit(() -> worker.pollOnce()).get(3, TimeUnit.SECONDS)).isFalse(); }
                catch (Exception e) { throw new AssertionError(e); }
                s.setRollbackOnly();
            });
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM jobs", Integer.class)).isZero();
        assertThat(fixtures.hooks).hasValue(0);
    }
    @Test void twoConnectionsClaimExactlyOneExecution() throws Exception {
        var id = submit();
        CountDownLatch start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            Callable<Optional<JobStore.Row>> work = () -> { start.await(); return new TransactionTemplate(manager).execute(s -> store.claim(clock.instant(), properties, registry.kinds())); };
            var a = pool.submit(work); var b = pool.submit(work); start.countDown();
            assertThat(List.of(a.get(3, TimeUnit.SECONDS), b.get(3, TimeUnit.SECONDS)).stream().filter(Optional::isPresent).count()).isEqualTo(1);
        }
        assertThat(jdbc.queryForObject("SELECT attempt FROM jobs WHERE id=?", Integer.class, id)).isEqualTo(1);
    }
    @Test void actualWorkerRunsOutsideTransactionAndCommitsHookWithResult() {
        fixtures.action = c -> {
            assertThat(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            return JobOutcome.succeeded(json.readTree("{\"public\":true}"));
        };
        var id = submit();
        assertThat(worker.pollOnce()).isTrue();
        awaitState(id, "SUCCEEDED");
        assertThat(fixtures.hooks).hasValue(1);
        assertThat(jdbc.queryForObject("SELECT nickname FROM users WHERE id=?", String.class, user)).isEqualTo("completed");
    }
    @Test void completionHookRollsBackTogetherWithJobResult() {
        var id = submit(); var c = claim(); fixtures.throwHook = true;
        assertThatThrownBy(() -> worker.finish(c, JobOutcome.succeeded(json.readTree("{}")))).isInstanceOf(IllegalStateException.class);
        assertThat(state(id)).isEqualTo("RUNNING");
        assertThat(jdbc.queryForObject("SELECT nickname FROM users WHERE id=?", String.class, user)).isEqualTo("original");
    }
    @Test void completionHookFailureIsRetriedThenFailsAfterMaxAttempts() {
        fixtures.throwHook = true;
        var id = submit();
        for (int attempt = 1; attempt <= properties.maxAttempts(); attempt++) {
            assertThat(worker.pollOnce()).isTrue();
            awaitState(id, attempt < properties.maxAttempts() ? "QUEUED" : "FAILED");
            assertThat(jdbc.queryForObject("SELECT attempt FROM jobs WHERE id=?", Integer.class, id)).isEqualTo(attempt);
            // The hook's own write rolled back with the result every time.
            assertThat(jdbc.queryForObject("SELECT nickname FROM users WHERE id=?", String.class, user)).isEqualTo("original");
            if (attempt < properties.maxAttempts()) {
                assertThat(service.get(user, id).error()).isNull();
                clock.advance(properties.retryDelay());
            }
        }
        assertThat(service.get(user, id).error().code()).isEqualTo("TEMPORARY_FAILURE");
        assertThat(fixtures.hooks).hasValue(0);
    }
    @Test void completionHookRecoversOnRetry() {
        fixtures.throwHook = true;
        var id = submit();
        assertThat(worker.pollOnce()).isTrue();
        awaitState(id, "QUEUED");
        fixtures.throwHook = false;
        clock.advance(properties.retryDelay());
        assertThat(worker.pollOnce()).isTrue();
        awaitState(id, "SUCCEEDED");
        assertThat(fixtures.hooks).hasValue(1);
        assertThat(jdbc.queryForObject("SELECT nickname FROM users WHERE id=?", String.class, user)).isEqualTo("completed");
    }
    @Test void retriesAreDelayedAndBoundedToThreeAttempts() {
        var id = submit();
        for (int attempt = 1; attempt <= 3; attempt++) {
            var c = claim(); assertThat(c.attempt()).isEqualTo(attempt);
            worker.finish(c, JobOutcome.failed(JobFailure.TEMPORARY_FAILURE));
            assertThat(state(id)).isEqualTo(attempt < 3 ? "QUEUED" : "FAILED");
            if (attempt < 3) assertThat(service.get(user, id).error()).isNull();
            assertThat(tx.<Optional<JobStore.Row>>execute(s -> store.claim(clock.instant(), properties, registry.kinds()))).isEmpty();
            clock.advance(properties.retryDelay());
        }
        assertThat(service.get(user, id).error().code()).isEqualTo("TEMPORARY_FAILURE");
    }
    @Test void permanentFailureDoesNotRetry() {
        var id = submit(); worker.finish(claim(), JobOutcome.failed(JobFailure.EXECUTION_FAILED));
        assertThat(state(id)).isEqualTo("FAILED");
        clock.advance(Duration.ofDays(1));
        assertThat(tx.<Optional<JobStore.Row>>execute(s -> store.claim(clock.instant(), properties, registry.kinds()))).isEmpty();
    }
    @Test void expiredLeaseFencesHeartbeatAndLateCompletionBeforeHook() {
        var id = submit(); var old = claim(); clock.advance(properties.lease());
        assertThat(tx.<Boolean>execute(s -> store.heartbeat(old, clock.instant(), properties))).isFalse();
        assertThat(worker.finish(old, JobOutcome.succeeded(json.readTree("{}")))).isFalse();
        var current = claim();
        assertThat(current.executionId()).isNotEqualTo(old.executionId());
        assertThat(worker.finish(old, JobOutcome.succeeded(json.readTree("{}")))).isFalse();
        assertThat(fixtures.hooks).hasValue(0);
        assertThat(worker.finish(current, JobOutcome.succeeded(json.readTree("{\"public\":true}")))).isTrue();
        assertThat(state(id)).isEqualTo("SUCCEEDED");
        assertThat(worker.finish(old, JobOutcome.failed(JobFailure.EXECUTION_FAILED))).isFalse();
    }
    @Test void crashedWorkersReachTerminalStateAtAttemptLimit() {
        var id = submit();
        for (int i = 0; i < 3; i++) { claim(); clock.advance(properties.lease()); }
        assertThat(tx.<Optional<JobStore.Row>>execute(s -> store.claim(clock.instant(), properties, registry.kinds()))).isEmpty();
        assertThat(state(id)).isEqualTo("FAILED");
    }
    @Test void heartbeatExtendsOnlyCurrentUnexpiredExecutionLease() {
        var id = submit(); var c = claim();
        clock.advance(properties.heartbeat());
        assertThat(tx.<Boolean>execute(s -> store.heartbeat(c, clock.instant(), properties))).isTrue();
        var lease = jdbc.queryForObject("SELECT lease_until FROM jobs WHERE id=?", java.sql.Timestamp.class, id).toInstant();
        assertThat(lease).isEqualTo(clock.instant().plus(properties.lease()));
        var impostor = new JobContext(c.jobId(), UUID.randomUUID(), c.attempt(), c.submission());
        assertThat(tx.<Boolean>execute(s -> store.heartbeat(impostor, clock.instant(), properties))).isFalse();
        assertThat(jdbc.queryForObject("SELECT lease_until FROM jobs WHERE id=?", java.sql.Timestamp.class, id).toInstant()).isEqualTo(lease);
    }
    @Test void unexpectedHandlerExceptionHasOnlyServerOwnedFailure() {
        fixtures.action = c -> { throw new IllegalStateException("sensitive-token-and-payload"); };
        var id = submit(); worker.pollOnce(); awaitState(id, "FAILED");
        var error = service.get(user, id).error();
        assertThat(error.code()).isEqualTo("EXECUTION_FAILED");
        assertThat(error.message()).doesNotContain("sensitive");
    }
    @Test void timeoutUsesClockAndLateSuccessCannotRunHook() throws Exception {
        CountDownLatch started = new CountDownLatch(1), release = new CountDownLatch(1), ended = new CountDownLatch(1);
        fixtures.action = c -> {
            started.countDown();
            boolean done = false;
            while (!done) { try { release.await(); done = true; } catch (InterruptedException ignored) { } }
            ended.countDown();
            return JobOutcome.succeeded(json.readTree("{}"));
        };
        var id = submit(); worker.pollOnce();
        assertThat(started.await(3, TimeUnit.SECONDS)).isTrue();
        clock.advance(properties.timeout()); worker.tick();
        assertThat(state(id)).isEqualTo("QUEUED");
        release.countDown(); assertThat(ended.await(3, TimeUnit.SECONDS)).isTrue();
        assertThat(fixtures.hooks).hasValue(0);
    }
    @Test void expiredExecutionDeadlineRejectsSuccessEvenWithoutMaintenanceTick() {
        var id = submit(); var c = claim(); clock.advance(properties.timeout());
        worker.finish(c, JobOutcome.succeeded(json.readTree("{}")));
        assertThat(state(id)).isEqualTo("QUEUED"); assertThat(fixtures.hooks).hasValue(0);
    }
    @Test void interruptIgnoringExecutionKeepsExecutorBounded() throws Exception {
        CountDownLatch started = new CountDownLatch(1), release = new CountDownLatch(1), ended = new CountDownLatch(1);
        fixtures.action = c -> {
            started.countDown();
            for (;;) { try { release.await(); break; } catch (InterruptedException ignored) { } }
            ended.countDown();
            return JobOutcome.succeeded(json.readTree("{}"));
        };
        var single = new JobProperties(false, properties.polling(), properties.timeout(), properties.lease(),
            properties.heartbeat(), 3, properties.retryDelay(), 1, 1);
        var bounded = new JobWorker(store, registry, single, clock, manager);
        try {
            var first = submit(); var second = submit();
            assertThat(bounded.pollOnce()).isTrue(); assertThat(started.await(3, TimeUnit.SECONDS)).isTrue();
            clock.advance(properties.timeout()); bounded.tick();
            assertThat(state(first)).isEqualTo("QUEUED");
            assertThat(bounded.pollOnce()).isFalse();
            assertThat(jdbc.queryForObject("SELECT attempt FROM jobs WHERE id=?", Integer.class, second)).isZero();
        } finally {
            release.countDown(); bounded.close();
            assertThat(ended.await(3, TimeUnit.SECONDS)).isTrue();
        }
    }
    @Test void shutdownLeavesInterruptedExecutionForLeaseRecovery() throws Exception {
        CountDownLatch started = new CountDownLatch(1);
        fixtures.action = c -> {
            started.countDown();
            try { new CountDownLatch(1).await(); } catch (InterruptedException e) { throw new IllegalStateException(e); }
            return JobOutcome.succeeded(json.readTree("{}"));
        };
        var closing = new JobWorker(store, registry, properties, clock, manager);
        var id = submit();
        assertThat(closing.pollOnce()).isTrue(); assertThat(started.await(3, TimeUnit.SECONDS)).isTrue();
        closing.close();
        assertThat(closing.awaitTermination(Duration.ofSeconds(3))).isTrue();
        assertThat(state(id)).isEqualTo("RUNNING");
        assertThat(closing.pollOnce()).isFalse();
        clock.advance(properties.lease());
        assertThat(claim().attempt()).isEqualTo(2);
    }
    @Test void unclaimReturnsAttemptOnlyForCurrentExecution() {
        var id = submit(); var c = claim();
        var impostor = new JobContext(c.jobId(), UUID.randomUUID(), c.attempt(), c.submission());
        tx.executeWithoutResult(s -> store.unclaim(impostor));
        assertThat(state(id)).isEqualTo("RUNNING");
        tx.executeWithoutResult(s -> store.unclaim(c));
        assertThat(state(id)).isEqualTo("QUEUED");
        assertThat(claim().attempt()).isEqualTo(1);
    }
    @Test void claimSkipsKindsWithoutLocalHandler() {
        var id = UUID.randomUUID();
        tx.executeWithoutResult(s -> store.insert(id, submission(JobKind.TRIP_RECOMMENDATION), clock.instant()));
        assertThat(worker.pollOnce()).isFalse();
        assertThat(state(id)).isEqualTo("QUEUED");
        assertThat(tx.<Optional<JobStore.Row>>execute(s -> store.claim(clock.instant(), properties, Set.of()))).isEmpty();
    }
    @Test void currentPolicyIsCheckedAtSubmissionExecutionCompletionAndRead() {
        fixtures.allowed.set(false);
        assertThatThrownBy(this::submit).isInstanceOf(BusinessException.class);
        fixtures.allowed.set(true); var id = submit(); fixtures.allowed.set(false);
        worker.pollOnce(); awaitState(id, "CANCELLED");
        assertThat(fixtures.hooks).hasValue(0);
        fixtures.allowed.set(true); id = submit(); var c = claim(); fixtures.completeAllowed.set(false);
        worker.finish(c, JobOutcome.succeeded(json.readTree("{}")));
        assertThat(state(id)).isEqualTo("CANCELLED");
        fixtures.readable.set(false); UUID hidden = id;
        assertThatThrownBy(() -> service.get(user, hidden)).isInstanceOf(BusinessException.class);
    }
    @Test void publicApiHidesPrivateInputsResultsAndOtherUsers() throws Exception {
        var id = submit(); worker.finish(claim(), JobOutcome.succeeded(json.readTree("{\"public\":true,\"private\":\"secret\"}")));
        mvc.perform(get("/api/v1/jobs/{id}", id).with(authUser(user)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.result.public").value(true))
            .andExpect(jsonPath("$.data.result.private").doesNotExist()).andExpect(jsonPath("$.data.input").doesNotExist())
            .andExpect(jsonPath("$.data.executionId").doesNotExist());
        mvc.perform(get("/api/v1/jobs/{id}", id).with(authUser(UUID.randomUUID())))
            .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("JOB_NOT_FOUND"));
        mvc.perform(get("/api/v1/jobs/{id}", UUID.randomUUID()).with(authUser(user))).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/jobs/{id}", id)).andExpect(status().isUnauthorized());
        jdbc.update("UPDATE users SET status='DEACTIVATED' WHERE id=?", user);
        assertThatThrownBy(() -> service.get(user, id)).isInstanceOf(BusinessException.class);
    }
    @Test void cleanupResultIsMinimalRequesterOnlyAndIndependentOfTripMembership() {
        var id = submit(JobKind.LEAVE_CLEANUP); var c = claim();
        worker.finish(c, JobOutcome.succeeded(json.readTree("{\"scope\":\"LEAVE_CLEANUP\",\"completedCount\":1,\"failedCount\":0,\"photoIds\":[\"private\"]}")));
        var result = service.get(user, id).result();
        assertThat(result.size()).isEqualTo(3); assertThat(result.has("photoIds")).isFalse();
        UUID other = UUID.randomUUID();
        assertThatThrownBy(() -> service.get(other, id)).isInstanceOf(BusinessException.class);
    }
    @Test void openApiContainsOnlyGetAndExpectedJobDto() throws Exception {
        var document = json.readTree(mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        var path = document.at("/paths/~1api~1v1~1jobs~1{jobId}");
        assertThat(path.size()).isEqualTo(1); assertThat(path.has("get")).isTrue();
        assertThat(path.at("/get/responses/404/description").asString()).contains("JOB_NOT_FOUND");
        assertThat(document.at("/components/schemas/Job/properties").propertyNames())
            .containsExactlyInAnyOrder("id", "kind", "status", "progress", "result", "error", "createdAt", "finishedAt");
        assertThat(document.at("/security").isMissingNode()).isFalse();
    }

    static class MutableClock extends Clock {
        volatile Instant now = Instant.parse("2026-11-02T00:00:00Z");
        void advance(Duration value) { now = now.plus(value); }
        public ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(ZoneId zone) { return this; }
        public Instant instant() { return now; }
    }
    @TestConfiguration(proxyBeanMethods = false)
    static class Fixtures {
        AtomicBoolean allowed = new AtomicBoolean(true), readable = new AtomicBoolean(true), completeAllowed = new AtomicBoolean(true);
        AtomicInteger hooks = new AtomicInteger();
        volatile boolean throwHook;
        volatile Function<JobContext, JobOutcome> action;
        @Bean @Primary MutableClock jobTestClock() { return new MutableClock(); }
        JobHandler handler(JobKind kind, JdbcTemplate jdbc) {
            return new JobHandler() {
                public JobKind kind() { return kind; }
                public void validate(JobSubmission s) { if (s.input().size() != 1 || !s.input().has("allowed")) throw new IllegalArgumentException("Invalid input"); }
                public JobOutcome execute(JobContext c) { return action.apply(c); }
                public void complete(JobContext c, JsonNode result) {
                    jdbc.update("UPDATE users SET nickname='completed' WHERE id=?", c.submission().requestedByUserId());
                    if (throwHook) throw new IllegalStateException("hook failure");
                    hooks.incrementAndGet();
                }
            };
        }
        JobAccessPolicy policy(JobKind kind) {
            return new JobAccessPolicy() {
                public JobKind kind() { return kind; }
                public boolean canSubmit(JobSubmission s) { return allowed.get(); }
                public boolean canExecute(JobContext c) { return allowed.get(); }
                public boolean canComplete(JobContext c) { return completeAllowed.get(); }
                public boolean canRead(UUID viewer, JobContext c) { return readable.get() && (kind.cleanup() || viewer.equals(c.submission().requestedByUserId())); }
                public JsonNode publicResult(UUID viewer, JobContext c, JsonNode result) {
                    return kind.cleanup() ? result : tools.jackson.databind.node.JsonNodeFactory.instance.objectNode().put("public", result.path("public").asBoolean());
                }
            };
        }
        @Bean JobHandler extractionHandler(JdbcTemplate jdbc) { return handler(JobKind.PLACE_EXTRACTION, jdbc); }
        @Bean JobAccessPolicy extractionPolicy() { return policy(JobKind.PLACE_EXTRACTION); }
        @Bean JobHandler cleanupHandler(JdbcTemplate jdbc) { return handler(JobKind.LEAVE_CLEANUP, jdbc); }
        @Bean JobAccessPolicy cleanupPolicy() { return policy(JobKind.LEAVE_CLEANUP); }
    }
}
