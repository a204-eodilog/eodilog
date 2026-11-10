package com.eodilog.photo;

import com.eodilog.job.*;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

@Component @RequiredArgsConstructor
public class PhotoDeleteJobAccessPolicy implements JobAccessPolicy {
    private final JdbcTemplate jdbc;
    public JobKind kind() { return JobKind.PHOTO_DELETE; }
    public boolean canSubmit(JobSubmission s) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                select exists(select 1 from photos p join assets a on a.id=p.asset_id
                join trip_members m on m.id=p.uploader_member_id join trips t on t.id=p.trip_id
                where p.id=? and p.trip_id=? and p.asset_id=? and p.deleted_at is not null
                and a.status='DELETING' and a.object_key=? and a.display_key=?
                and m.user_id=? and m.status='ACTIVE' and t.deleted_at is null)
                """, Boolean.class, s.cleanupScope().photoIds().getFirst(), s.tripId(),
                UUID.fromString(s.input().path("assetId").asString()), s.input().path("objectKey").asString(),
                s.input().path("displayKey").asString(), s.requestedByUserId()));
    }
    // Approval is permanent, including after membership, photo and trip children disappear.
    public boolean canExecute(JobContext c) { return true; }
    public boolean canComplete(JobContext c) { return true; }
    public boolean canRead(UUID user, JobContext c) { return user.equals(c.submission().requestedByUserId()); }
    public JsonNode publicResult(UUID user, JobContext c, JsonNode result) { return result; }
}
