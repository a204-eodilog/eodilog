package com.eodilog.job;

import tools.jackson.databind.JsonNode;

public interface JobHandler {
    JobKind kind();
    /** Validate the kind-specific input allowlist before any insert. */
    void validate(JobSubmission submission);
    /** Runs outside a database transaction. Do not perform domain completion writes here. */
    JobOutcome execute(JobContext context) throws Exception;
    /** Runs only while holding the fenced job row lock, in the result transaction. No external I/O. */
    void complete(JobContext context, JsonNode result);
}
