package com.eodilog.job;

import java.util.*;
import org.springframework.stereotype.Component;

@Component
public class JobRegistry {
    private final Map<JobKind, JobHandler> handlers = new EnumMap<>(JobKind.class);
    private final Map<JobKind, JobAccessPolicy> policies = new EnumMap<>(JobKind.class);
    public JobRegistry(List<JobHandler> handlers, List<JobAccessPolicy> policies) {
        handlers.forEach(h -> { if (this.handlers.put(h.kind(), h) != null) throw new IllegalStateException("Duplicate job handler"); });
        policies.forEach(p -> { if (this.policies.put(p.kind(), p) != null) throw new IllegalStateException("Duplicate job policy"); });
        if (!this.handlers.keySet().equals(this.policies.keySet())) throw new IllegalStateException("Every job kind needs a handler and policy");
    }
    public JobHandler handler(JobKind kind) {
        var handler = handlers.get(kind);
        if (handler == null) throw new IllegalStateException("Job kind is not enabled");
        return handler;
    }
    public JobAccessPolicy policy(JobKind kind) {
        handler(kind);
        return policies.get(kind);
    }
    public boolean enabled(JobKind kind) { return handlers.containsKey(kind); }
}
