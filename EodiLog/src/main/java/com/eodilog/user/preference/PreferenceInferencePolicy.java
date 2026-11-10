package com.eodilog.user.preference;

import com.eodilog.job.*;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

@Component
@RequiredArgsConstructor
public class PreferenceInferencePolicy implements JobAccessPolicy {
    private final PreferenceRepository repository;
    @Override public JobKind kind() { return JobKind.PREFERENCE_INFERENCE; }
    static boolean current(PreferenceRepository repository, JobSubmission s) {
        try {
            var user=repository.user(s.requestedByUserId(),true);
            return user.consent() && s.baseVersion()!=null && repository.version(s.requestedByUserId())==s.baseVersion()
                    && repository.snapshot(s.requestedByUserId()).equals(s.input());
        } catch(com.eodilog.global.common.error.BusinessException e) { return false; }
    }
    @Override public boolean canSubmit(JobSubmission s) { return current(repository,s); }
    @Override public boolean canExecute(JobContext c) { return current(repository,c.submission()); }
    @Override public boolean canComplete(JobContext c) { return current(repository,c.submission()); }
    @Override public boolean canRead(UUID viewer,JobContext c) {
        return viewer.equals(c.submission().requestedByUserId());
    }
    @Override public JsonNode publicResult(UUID viewer,JobContext c,JsonNode result) {
        PreferenceInferenceHandler.validated(result);
        // Revocation/deletion must also prevent old job results from exposing obsolete inference.
        var safe=result.deepCopy();
        var items=tools.jackson.databind.node.JsonNodeFactory.instance.arrayNode();
        if(repository.user(viewer,false).consent()) repository.items(viewer,"INFERRED").forEach(i->items.addObject().put("key",i.key()).put("value",i.value()));
        ((tools.jackson.databind.node.ObjectNode)safe).set("inferredItems",items);
        return safe;
    }
}
