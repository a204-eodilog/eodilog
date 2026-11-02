package com.eodilog.job;

import java.time.Clock;
import java.util.UUID;
import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.id.UuidV7;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.JsonNodeFactory;

@Service
public class JobService {
    private final JobStore store;
    private final JobRegistry registry;
    private final Clock clock;
    public JobService(JobStore store, JobRegistry registry, Clock clock) { this.store = store; this.registry = registry; this.clock = clock; }

    @Transactional(propagation = Propagation.MANDATORY)
    public JobRef submit(JobSubmission submission) {
        if (org.springframework.transaction.support.TransactionSynchronizationManager.isCurrentTransactionReadOnly())
            throw new IllegalStateException("Job submission requires a write transaction");
        var handler = registry.handler(submission.kind());
        handler.validate(submission);
        if (!store.active(submission.requestedByUserId()) || !registry.policy(submission.kind()).canSubmit(submission))
            throw new BusinessException(JobErrorCode.JOB_NOT_FOUND);
        UUID id = UuidV7.generate();
        store.insert(id, submission, clock.instant());
        return JobRef.queued(id);
    }

    @Transactional(readOnly = true)
    public Job get(UUID viewer, UUID id) {
        var row = store.find(id, false).orElseThrow(() -> new BusinessException(JobErrorCode.JOB_NOT_FOUND));
        var c = row.context();
        var kind = c.submission().kind();
        if (!store.active(viewer) || !registry.enabled(kind) || kind == JobKind.ACCOUNT_DELETE
            || (kind.cleanup() && !viewer.equals(c.submission().requestedByUserId()))
            || !registry.policy(kind).canRead(viewer, c)) throw new BusinessException(JobErrorCode.JOB_NOT_FOUND);
        JsonNode result = row.result() == null ? null : registry.policy(kind).publicResult(viewer, c, row.result().deepCopy());
        if (result != null && kind.cleanup()) result = cleanupResult(result);
        return new Job(id, kind, row.status(), row.progress(), result,
            row.failure() == null ? null : new Job.Failure(row.failure().name(), row.failure().message()), row.createdAt(), row.finishedAt());
    }
    static JsonNode cleanupResult(JsonNode source) {
        var safe = JsonNodeFactory.instance.objectNode();
        // A kind name describes scope without disclosing target IDs or content.
        var scope = source.get("scope");
        if (scope == null || !scope.isString() || !java.util.Set.of("LEAVE_CLEANUP", "PHOTO_DELETE", "TRIP_DELETE", "ACCOUNT_DELETE").contains(scope.asString()))
            throw new IllegalArgumentException("Invalid cleanup result scope");
        safe.put("scope", scope.asString());
        for (String count : new String[]{"completedCount", "failedCount"}) {
            var value = source.get(count);
            if (value == null || !value.isIntegralNumber() || !value.canConvertToLong() || value.asLong() < 0) throw new IllegalArgumentException("Invalid cleanup result count");
            safe.put(count, value.asLong());
        }
        return safe;
    }
}
