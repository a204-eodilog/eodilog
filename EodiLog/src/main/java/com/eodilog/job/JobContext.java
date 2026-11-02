package com.eodilog.job;

import java.util.UUID;
import tools.jackson.databind.JsonNode;

/** jobId is the stable external idempotency key; executionId changes for each attempt. */
public record JobContext(UUID jobId, UUID executionId, int attempt, JobSubmission submission) { }
