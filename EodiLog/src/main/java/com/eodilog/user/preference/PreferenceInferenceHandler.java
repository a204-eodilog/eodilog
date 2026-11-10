package com.eodilog.user.preference;

import com.eodilog.global.ai.*;
import com.eodilog.job.*;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

@Component
@RequiredArgsConstructor
public class PreferenceInferenceHandler implements JobHandler {
    static final Set<String> TAGS=Set.of("바다","맛집","카페","산","도시","사진","산책","야경","휴식","골목");
    private final AiServerClient ai;
    private final PreferenceRepository repository;
    @Override public JobKind kind() { return JobKind.PREFERENCE_INFERENCE; }
    @Override public void validate(JobSubmission s) {
        if(s.tripId()!=null || s.baseVersion()==null || s.input().size()!=4
                || !s.requestedByUserId().toString().equals(s.input().path("userId").asString())
                || !s.input().path("savedPlaces").isArray() || !s.input().path("explicitItems").isArray()
                || !s.input().path("rejectedKeys").isArray()) throw new IllegalArgumentException("Invalid preference input");
    }
    @Override public JobOutcome execute(JobContext c) {
        if(c.submission().input().path("savedPlaces").size()<5) return JobOutcome.failed(JobFailure.INSUFFICIENT_DATA);
        try {
            var data=ai.post("/ai/v1/preference-inferences",c.jobId(),c.submission().input());
            var items=validated(data);
            Set<String> protectedKeys=new HashSet<>();
            c.submission().input().path("explicitItems").forEach(i->protectedKeys.add(PreferenceService.canonical(i.path("key").asString())));
            c.submission().input().path("rejectedKeys").forEach(i->protectedKeys.add(PreferenceService.canonical(i.asString())));
            if(items.stream().anyMatch(i->protectedKeys.contains(PreferenceService.canonical(i.key())))) return JobOutcome.failed(JobFailure.EXECUTION_FAILED);
            return JobOutcome.succeeded(data);
        } catch(AiServerException e) { return JobOutcome.failed(e.retryable()?JobFailure.TEMPORARY_FAILURE:JobFailure.EXECUTION_FAILED); }
        catch(IllegalArgumentException e) { return JobOutcome.failed(JobFailure.EXECUTION_FAILED); }
    }
    static List<Preferences.Item> validated(JsonNode data) {
        if(data==null || !data.isObject() || data.size()!=1 || !data.path("inferredItems").isArray() || data.path("inferredItems").size()>5) throw new IllegalArgumentException("Invalid inference result");
        Set<String> keys=new HashSet<>(); List<Preferences.Item> result=new ArrayList<>();
        for(var item:data.path("inferredItems")) {
            if(!item.isObject() || item.size()!=2 || !item.path("key").isString() || !item.path("value").isString()) throw new IllegalArgumentException("Invalid inference item");
            String key=item.path("key").asString();
            if(!TAGS.contains(key) || !key.equals(item.path("value").asString()) || !keys.add(key)) throw new IllegalArgumentException("Invalid inference tag");
            result.add(new Preferences.Item(key,key));
        }
        return List.copyOf(result);
    }
    @Override public void complete(JobContext c,JsonNode result) {
        // Reacquire and check even if the common worker already ran canComplete.
        if(!PreferenceInferencePolicy.current(repository,c.submission())) throw new IllegalStateException("Preference input changed");
        var items=validated(result);
        Set<String> protectedKeys=new HashSet<>(repository.rejected(c.submission().requestedByUserId()));
        repository.items(c.submission().requestedByUserId(),"EXPLICIT").forEach(i->protectedKeys.add(PreferenceService.canonical(i.key())));
        if(items.stream().anyMatch(i->protectedKeys.contains(PreferenceService.canonical(i.key())))) throw new IllegalArgumentException("Protected preference");
        repository.replace(c.submission().requestedByUserId(),"INFERRED",items);
    }
}
