package com.eodilog.photo.classification;

import com.eodilog.global.ai.*;
import com.eodilog.job.*;
import java.util.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.JsonNodeFactory;

@Component @RequiredArgsConstructor @Slf4j
public class ClassificationHandler implements JobHandler {
    private final AiServerClient ai;
    private final ClassificationStager stager;
    private final ClassificationAccess access;
    public JobKind kind() { return JobKind.PHOTO_CLASSIFICATION; }
    public void validate(JobSubmission s) {
        if(s.tripId()==null || s.baseVersion()!=null || !s.input().path("photos").isArray() || s.input().path("photos").isEmpty() || s.input().path("photos").size()>50) throw new IllegalArgumentException("Invalid classification input");
        Set<UUID> ids=new HashSet<>();
        for(var p:s.input().path("photos")) {
            if(!ids.add(ClassificationResult.uuid(p.path("photoId"))) || p.path("version").asLong()<1 || !p.path("displayKey").isString() || !p.path("contentType").isString()) throw new IllegalArgumentException("Invalid photo snapshot");
            ClassificationResult.uuid(p.path("assetId"));
        }
    }
    public JobOutcome execute(JobContext c) {
        try(var staged=stager.stage(c)) {
            var all=JsonNodeFactory.instance.objectNode(); var photos=all.putArray("photos");
            if(!staged.files.isEmpty()) {
                ClassificationStager.checkInterrupted();
                if(!access.allowed(c.submission().tripId(),c.submission().requestedByUserId()))
                    return JobOutcome.failed(JobFailure.POLICY_REVOKED);
                var meta=JsonNodeFactory.instance.objectNode(); var ids=meta.putArray("photoIds");
                staged.ids.forEach(id->ids.add(id.toString()));
                var valid=ClassificationResult.sanitize(ai.postMultipart("/ai/v1/photo-classifications",c.jobId(),meta,staged.files),new HashSet<>(staged.ids));
                for(var p:valid.path("photos")) photos.add(p);
            }
            for(var p:staged.failures.path("photos")) photos.add(p);
            return JobOutcome.succeeded(all);
        } catch(AiServerException ex) {
            log.warn("photo_classification_failed jobId={} category={} exceptionClass={}",c.jobId(),ex.retryable()?"infrastructure":"model_response",ex.getClass().getSimpleName());
            return JobOutcome.failed(ex.retryable()?JobFailure.TEMPORARY_FAILURE:JobFailure.EXECUTION_FAILED);
        } catch(RuntimeException ex) {
            log.warn("photo_classification_failed jobId={} category={} exceptionClass={}",c.jobId(),ex instanceof java.util.concurrent.CancellationException?"cancelled":"invalid_response",ex.getClass().getSimpleName());
            return JobOutcome.failed(JobFailure.EXECUTION_FAILED);
        }
    }
    public void complete(JobContext c,JsonNode result) { }
}
