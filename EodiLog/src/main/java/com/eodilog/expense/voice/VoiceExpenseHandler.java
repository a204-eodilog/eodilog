package com.eodilog.expense.voice;
import com.eodilog.global.ai.*;
import com.eodilog.global.storage.ObjectStorage;
import com.eodilog.job.*;
import java.time.*;
import java.util.*;
import java.nio.file.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
@Component @RequiredArgsConstructor
public class VoiceExpenseHandler implements JobHandler {
    private final AiServerClient ai;private final ObjectStorage storage;private final VoiceExpenseUploads uploads;
    private final VoiceExpenseResultReader reader;private final JsonMapper json;
    public JobKind kind(){return JobKind.VOICE_EXPENSE_DRAFT;}
    public void validate(JobSubmission s){
        if(s.tripId()==null||s.baseVersion()!=null||s.input().size()!=2||!s.input().path("uploadId").isString()
            || !s.input().path("referenceAt").isString())throw new IllegalArgumentException("Invalid voice request");
        UUID.fromString(s.input().path("uploadId").asString());Instant.parse(s.input().path("referenceAt").asString());
    }
    public JobOutcome execute(JobContext c) {
        UUID upload=UUID.fromString(c.submission().input().path("uploadId").asString());Path local=null;
        try {
            var row=uploads.find(upload).orElseThrow();
            byte[] bytes=storage.read(row.key(),VoiceExpenseService.MAX_BYTES);
            local=Files.createTempFile("voice-expense-ai-", ".m4a");Files.write(local,bytes);
            var meta=json.createObjectNode().put("language","ko").put("timeZone","Asia/Seoul");
            meta.set("referenceAt",c.submission().input().path("referenceAt"));
            JsonNode reply=ai.postMultipart("/ai/v1/voice-expense-drafts",c.jobId(),Map.of("meta",json.writeValueAsString(meta)),
                "audio",List.of(new AiServerClient.MultipartFile(local,"audio/mp4")));
            return JobOutcome.succeeded(json.valueToTree(reader.read(c.submission().tripId(),c.submission().requestedByUserId(),reply)));
        } catch(VoiceExpenseResultReader.Invalid ex){return JobOutcome.failed(ex.failure);}
        catch(AiServerException ex){return JobOutcome.failed(map(ex));}
        catch(Exception ex){if(ex instanceof InterruptedException)Thread.currentThread().interrupt();return JobOutcome.failed(JobFailure.VOICE_PROCESSING_INTERRUPTED);}
        finally {
            if(local!=null)try{Files.deleteIfExists(local);}catch(java.io.IOException ignored){}
            uploads.erase(upload);
        }
    }
    private JobFailure map(AiServerException ex){
        if(ex.timedOut())return JobFailure.VOICE_PROCESSING_TIMEOUT;
        if("INPUT_LIMIT_EXCEEDED".equals(ex.providerCode()))return JobFailure.VOICE_INPUT_LIMIT_EXCEEDED;
        if("INSUFFICIENT_DATA".equals(ex.providerCode()))return JobFailure.VOICE_NO_SPEECH_OR_EXPENSE;
        if("VOICE_EXPENSE_UNSUPPORTED".equals(ex.providerCode()))return JobFailure.VOICE_EXPENSE_UNSUPPORTED;
        if(ex.status()==400)return JobFailure.VOICE_AUDIO_INVALID;
        return ex.retryable()?JobFailure.VOICE_PROVIDER_UNAVAILABLE:JobFailure.VOICE_PROCESSING_INTERRUPTED;
    }
    public void complete(JobContext c,JsonNode result){}
}
