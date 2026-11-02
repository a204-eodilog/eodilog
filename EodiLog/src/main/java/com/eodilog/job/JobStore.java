package com.eodilog.job;

import java.sql.*;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;

@Repository
public class JobStore {
    private final JdbcTemplate jdbc;
    private final JsonMapper json;
    public JobStore(JdbcTemplate jdbc, JsonMapper json) { this.jdbc = jdbc; this.json = json; }
    record Row(JobContext context, JobStatus status, int progress, tools.jackson.databind.JsonNode result,
               JobFailure failure, Instant createdAt, Instant finishedAt, Instant leaseUntil, Instant executionStartedAt) { }
    private Row map(ResultSet rs, int index) throws SQLException {
        var submission = new JobSubmission(rs.getObject("requested_by_user_id", UUID.class), JobKind.valueOf(rs.getString("kind")),
            rs.getObject("trip_id", UUID.class), json.readTree(rs.getString("input_json")), (Long) rs.getObject("base_version"),
            rs.getString("cleanup_scope_json") == null ? null : json.readValue(rs.getString("cleanup_scope_json"), CleanupScope.class));
        return new Row(new JobContext(rs.getObject("id", UUID.class), rs.getObject("execution_id", UUID.class), rs.getInt("attempt"), submission),
            JobStatus.valueOf(rs.getString("status")), rs.getInt("progress"), rs.getString("result_json") == null ? null : json.readTree(rs.getString("result_json")),
            rs.getString("error_code") == null ? null : JobFailure.valueOf(rs.getString("error_code")), instant(rs, "created_at"), instant(rs, "finished_at"), instant(rs, "lease_until"), instant(rs, "execution_started_at"));
    }
    private static Instant instant(ResultSet rs, String name) throws SQLException {
        var value = rs.getTimestamp(name); return value == null ? null : value.toInstant();
    }
    static Timestamp time(Instant value) { return Timestamp.from(value); }
    void insert(UUID id, JobSubmission s, Instant now) {
        jdbc.update("INSERT INTO jobs(id,requested_by_user_id,trip_id,kind,input_json,cleanup_scope_json,base_version,next_attempt_at,created_at) VALUES (?,?,?,?,?::jsonb,?::jsonb,?,?,?)",
            id, s.requestedByUserId(), s.tripId(), s.kind().name(), json.writeValueAsString(s.input()),
            s.cleanupScope() == null ? null : json.writeValueAsString(s.cleanupScope()), s.baseVersion(), time(now), time(now));
    }
    Optional<Row> find(UUID id, boolean lock) {
        return jdbc.query("SELECT * FROM jobs WHERE id=? AND deleted_at IS NULL" + (lock ? " FOR UPDATE" : ""), this::map, id).stream().findFirst();
    }
    boolean active(UUID userId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM users WHERE id=? AND status='ACTIVE')", Boolean.class, userId));
    }
    Optional<Row> claim(Instant now, JobProperties p, Set<JobKind> kinds) {
        // Expired last attempts become terminal even after a process restart.
        jdbc.update("UPDATE jobs SET status='FAILED',error_code='TIMEOUT',finished_at=?,execution_id=NULL,lease_until=NULL WHERE status='RUNNING' AND lease_until<=? AND attempt>=?", time(now), time(now), p.maxAttempts());
        // Only kinds this instance can execute, so an instance without the handler never cancels them.
        if (kinds.isEmpty()) return Optional.empty();
        var rows = jdbc.query("SELECT * FROM jobs WHERE deleted_at IS NULL AND kind = ANY(?::varchar[]) AND attempt<? AND ((status='QUEUED' AND next_attempt_at<=?) OR (status='RUNNING' AND lease_until<=?)) ORDER BY next_attempt_at,created_at,id FOR UPDATE SKIP LOCKED LIMIT 1",
            this::map, kinds.stream().map(Enum::name).toArray(String[]::new), p.maxAttempts(), time(now), time(now));
        if (rows.isEmpty()) return Optional.empty();
        var row = rows.getFirst();
        UUID executionId = com.eodilog.global.id.UuidV7.generate();
        jdbc.update("UPDATE jobs SET status='RUNNING',attempt=attempt+1,execution_id=?,execution_started_at=?,lease_until=?,heartbeat_at=?,error_code=NULL WHERE id=?",
            executionId, time(now), time(now.plus(p.lease())), time(now), row.context().jobId());
        return find(row.context().jobId(), false);
    }
    /** Returns a claim whose execution never started, without consuming the attempt. */
    void unclaim(JobContext c) {
        jdbc.update("UPDATE jobs SET status='QUEUED',attempt=attempt-1,execution_id=NULL,execution_started_at=NULL,lease_until=NULL,heartbeat_at=NULL WHERE id=? AND execution_id=? AND status='RUNNING'",
            c.jobId(), c.executionId());
    }
    boolean heartbeat(JobContext c, Instant now, JobProperties p) {
        return jdbc.update("UPDATE jobs SET heartbeat_at=?,lease_until=? WHERE id=? AND execution_id=? AND status='RUNNING' AND lease_until>?",
            time(now), time(now.plus(p.lease())), c.jobId(), c.executionId(), time(now)) == 1;
    }
    void success(JobContext c, tools.jackson.databind.JsonNode result, Instant now) {
        jdbc.update("UPDATE jobs SET status='SUCCEEDED',progress=100,result_json=?::jsonb,error_code=NULL,finished_at=?,execution_id=NULL,lease_until=NULL WHERE id=?",
            json.writeValueAsString(result), time(now), c.jobId());
    }
    void failure(JobContext c, JobFailure failure, Instant now, JobProperties p) {
        boolean retry = failure.retryable() && c.attempt() < p.maxAttempts();
        jdbc.update("UPDATE jobs SET status=?,error_code=?,next_attempt_at=?,finished_at=?,execution_id=NULL,lease_until=NULL WHERE id=?",
            retry ? "QUEUED" : failure == JobFailure.POLICY_REVOKED ? "CANCELLED" : "FAILED", failure.name(), time(now.plus(p.retryDelay())), retry ? null : time(now), c.jobId());
    }
}
