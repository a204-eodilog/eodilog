package com.eodilog.expense.voice;
import com.eodilog.job.*;
import java.time.*;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
@Component @RequiredArgsConstructor
public class VoiceExpensePolicy implements JobAccessPolicy {
    private final VoiceExpenseUploads uploads;private final Clock clock;
    public JobKind kind(){return JobKind.VOICE_EXPENSE_DRAFT;}
    public boolean canSubmit(JobSubmission s){
        var u=uploads.find(UUID.fromString(s.input().path("uploadId").asString()));
        return u.isPresent()&&u.get().requester().equals(s.requestedByUserId())&&u.get().trip().equals(s.tripId())
            &&u.get().expiresAt().isAfter(clock.instant())&&!u.get().deleted()&&uploads.active(s.tripId(),s.requestedByUserId());
    }
    public boolean canExecute(JobContext c){return c.attempt()==1 && canSubmit(c.submission())&&linked(c);}
    private boolean linked(JobContext c){return uploads.find(UUID.fromString(c.submission().input().path("uploadId").asString()))
        .map(u->c.jobId().equals(u.jobId())).orElse(false);}
    public boolean canComplete(JobContext c){return linked(c)&&uploads.active(c.submission().tripId(),c.submission().requestedByUserId());}
    public boolean canRead(UUID viewer,JobContext c){return viewer.equals(c.submission().requestedByUserId())&&linked(c)
        &&uploads.active(c.submission().tripId(),viewer)&&uploads.resultVisible(c.jobId());}
    public JsonNode publicResult(UUID viewer,JobContext c,JsonNode stored){return stored.deepCopy();}
}
