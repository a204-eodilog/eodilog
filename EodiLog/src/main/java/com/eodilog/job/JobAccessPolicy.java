package com.eodilog.job;

import java.util.UUID;
import tools.jackson.databind.JsonNode;

/** Domain implementations must check current membership, consent and version where applicable. */
public interface JobAccessPolicy {
    JobKind kind();
    boolean canSubmit(JobSubmission submission);
    boolean canExecute(JobContext context);
    boolean canComplete(JobContext context);
    boolean canRead(UUID viewerUserId, JobContext context);
    /** Explicit allowlist projection: never return the private input snapshot. */
    JsonNode publicResult(UUID viewerUserId, JobContext context, JsonNode storedResult);
}
