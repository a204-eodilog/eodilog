package com.eodilog.job;

import tools.jackson.databind.JsonNode;

public record JobOutcome(JsonNode result, JobFailure failure) {
    public JobOutcome {
        if ((result == null) == (failure == null)) throw new IllegalArgumentException("Exactly one outcome required");
        if (result != null && !result.isObject()) throw new IllegalArgumentException("Result must be an object");
    }
    public static JobOutcome succeeded(JsonNode result) { return new JobOutcome(result, null); }
    public static JobOutcome failed(JobFailure failure) { return new JobOutcome(null, failure); }
}
