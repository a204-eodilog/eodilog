package com.eodilog.expense.voice;
import com.eodilog.global.storage.ObjectStorage;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.jdbc.core.JdbcTemplate;
@Component @RequiredArgsConstructor @Slf4j
public class VoiceExpenseUploads {
    private final JdbcTemplate jdbc; private final ObjectStorage storage; private final Clock clock;
    record Upload(UUID id,UUID requester,UUID trip,String key,UUID jobId,Instant createdAt,Instant expiresAt,boolean deleted){}
    Optional<Upload> find(UUID id){return jdbc.query("select * from voice_expense_uploads where id=?",(r,n)->
        new Upload(id,r.getObject("requested_by_user_id",UUID.class),r.getObject("trip_id",UUID.class),r.getString("object_key"),
            r.getObject("job_id",UUID.class),r.getTimestamp("created_at").toInstant(),r.getTimestamp("expires_at").toInstant(),r.getTimestamp("audio_deleted_at")!=null),id).stream().findFirst();}
    void record(UUID id,UUID requester,UUID trip,String key){
        jdbc.update("insert into voice_expense_uploads(id,requested_by_user_id,trip_id,object_key,created_at,expires_at) values(?,?,?,?,?,?)",
            id,requester,trip,key,Timestamp.from(clock.instant()),Timestamp.from(clock.instant().plus(Duration.ofMinutes(10))));
    }
    void attach(UUID upload,UUID job){if(jdbc.update("update voice_expense_uploads set job_id=? where id=? and job_id is null and audio_deleted_at is null",job,upload)!=1)throw new IllegalStateException("Audio upload unavailable");}
    void erase(UUID id){
        var row=find(id);if(row.isEmpty())return;
        try {
            storage.delete(row.get().key());
            jdbc.update("update voice_expense_uploads set audio_deleted_at=? where id=?",Timestamp.from(clock.instant()),id);
        } catch(RuntimeException ex){log.warn("voice_audio_cleanup_pending uploadId={}",id);}
    }
    boolean active(UUID trip,UUID user){return Boolean.TRUE.equals(jdbc.queryForObject("""
        select exists(select 1 from trips t join trip_members m on m.trip_id=t.id join users u on u.id=m.user_id
        where t.id=? and t.deleted_at is null and m.user_id=? and m.status='ACTIVE' and u.status='ACTIVE' and u.profile_completed)
        """,Boolean.class,trip,user));}
    boolean resultVisible(UUID job){return Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from jobs where id=? and deleted_at is null and coalesce(finished_at,created_at)>?)",Boolean.class,job,Timestamp.from(clock.instant().minus(Duration.ofHours(1)))));}
}
