package com.eodilog.expense.voice;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.jdbc.core.JdbcTemplate;
@Component @RequiredArgsConstructor
public class VoiceExpenseCleanup {
    private final VoiceExpenseUploads uploads;private final JdbcTemplate jdbc;private final Clock clock;private final VoiceExpenseProperties properties;
    @Scheduled(fixedDelayString="${app.voice-expense.cleanup-delay:30000}")
    public void scheduled(){if(properties.cleanupEnabled())runOnce();}
    public void runOnce(){
        var now=Timestamp.from(clock.instant());
        // 중단·만료 작업을 먼저 fence하여 늦은 응답이 다시 결과를 쓸 수 없게 한다.
        jdbc.update("""
            update jobs j set status='FAILED',error_code='VOICE_PROCESSING_INTERRUPTED',finished_at=?,execution_id=null,lease_until=null
            where j.kind='VOICE_EXPENSE_DRAFT' and j.status in ('QUEUED','RUNNING') and exists
            (select 1 from voice_expense_uploads u where u.job_id=j.id and u.expires_at<=?)
            """,now,now);
        var ids=jdbc.queryForList("""
            select u.id from voice_expense_uploads u left join jobs j on j.id=u.job_id
            where u.audio_deleted_at is null and (u.expires_at<=? or (u.job_id is not null and
            (j.id is null or j.deleted_at is not null or j.status in ('SUCCEEDED','FAILED','CANCELLED'))))
            order by u.created_at limit 100
            """,UUID.class,now);
        for(UUID id:ids)uploads.erase(id);
        var cutoff=Timestamp.from(clock.instant().minus(Duration.ofHours(1)));
        jdbc.update("""
            update jobs set result_json=null,input_json='{}'::jsonb,deleted_at=?
            where kind='VOICE_EXPENSE_DRAFT' and deleted_at is null and status in ('SUCCEEDED','FAILED','CANCELLED')
            and coalesce(finished_at,created_at)<=?
            """,now,cutoff);
        // 이미 원음이 정리되고 보존 기간도 지난 메타데이터만 삭제한다.
        jdbc.update("""
            delete from voice_expense_uploads u where u.audio_deleted_at is not null and u.created_at<=?
            and not exists(select 1 from jobs j where j.id=u.job_id and j.deleted_at is null)
            """,cutoff);
    }
}
