package com.eodilog.expense.voice;
import com.eodilog.global.common.error.*;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import com.eodilog.global.id.UuidV7;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.global.storage.ObjectStorage;
import com.eodilog.job.*;
import com.eodilog.trip.service.TripAccessChecker;
import java.time.*;
import java.util.*;
import java.security.*;
import java.io.*;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;
import tools.jackson.databind.json.JsonMapper;
@Service
public class VoiceExpenseService {
    static final long MAX_BYTES=10*1024*1024;
    private final IdempotencyService idempotency;private final TripAccessChecker access;private final AudioProbe probe;
    private final ObjectStorage storage;private final VoiceExpenseUploads uploads;private final JobService jobs;
    private final JsonMapper json;private final Clock clock;private final TransactionTemplate tx;
    public VoiceExpenseService(IdempotencyService idempotency,TripAccessChecker access,AudioProbe probe,ObjectStorage storage,
        VoiceExpenseUploads uploads,JobService jobs,JsonMapper json,Clock clock,PlatformTransactionManager manager){
        this.idempotency=idempotency;this.access=access;this.probe=probe;this.storage=storage;this.uploads=uploads;
        this.jobs=jobs;this.json=json;this.clock=clock;this.tx=new TransactionTemplate(manager);
    }
    record Fingerprint(String audioSha256){}
    public JobRef submit(UUID user,UUID trip,String key,MultipartFile audio){
        idempotency.validateKey(key);access.requireActiveMember(trip,user);
        if(audio==null || audio.isEmpty() || !"audio/mp4".equalsIgnoreCase(audio.getContentType()))throw invalid();
        if(audio.getSize()>MAX_BYTES)throw new BusinessException(VoiceExpenseError.INPUT_LIMIT_EXCEEDED);
        byte[] bytes;
        try(var input=audio.getInputStream()){bytes=input.readNBytes((int)MAX_BYTES+1);}catch(IOException ex){throw invalid();}
        if(bytes.length==0)throw invalid();if(bytes.length>MAX_BYTES)throw new BusinessException(VoiceExpenseError.INPUT_LIMIT_EXCEEDED);
        Fingerprint fingerprint;
        try{fingerprint=new Fingerprint(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)));}
        catch(NoSuchAlgorithmException ex){throw new IllegalStateException(ex);}
        String scope="POST /api/v1/trips/"+trip+"/expense-voice-drafts";
        var replay=idempotency.findCompleted(user,scope,key,fingerprint,JobRef.class);if(replay.isPresent())return replay.get();
        probe.validate(bytes);
        UUID upload=UuidV7.generate();String objectKey="voice-expense/"+user+"/"+upload+".m4a";
        tx.executeWithoutResult(s->uploads.record(upload,user,trip,objectKey));
        boolean committed=false;
        try {
            storage.write(objectKey,bytes,"audio/mp4");
            JobRef result=tx.execute(s->{
                access.requireActiveMemberForUpdate(trip,user);
                return idempotency.execute(user,scope,key,fingerprint,JobRef.class,HttpStatus.ACCEPTED,()->{
                    var input=json.createObjectNode().put("uploadId",upload.toString()).put("referenceAt",clock.instant().toString());
                    JobRef job=jobs.submit(new JobSubmission(user,JobKind.VOICE_EXPENSE_DRAFT,trip,input,null,null));
                    uploads.attach(upload,job.jobId());return job;
                });
            });
            committed=true;
            if(uploads.find(upload).orElseThrow().jobId()==null)uploads.erase(upload);
            return result;
        }finally{if(!committed)uploads.erase(upload);}
    }
    private BusinessException invalid(){return new BusinessException(CommonErrorCode.VALIDATION_ERROR,"녹음 파일 한 개를 보내 주세요.",List.of(new ErrorField("audio","audio/mp4 파일이 필요합니다.")));}
}
