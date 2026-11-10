package com.eodilog.feed;

import com.eodilog.job.*;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

/**
 * Submission: the requester is an ACTIVE member of the non-deleted trip and every frozen target is their own,
 * already tombstoned record of that trip. Approval is permanent: execution and completion continue after leaving.
 * Only the requester reads the job.
 */
@Component
@RequiredArgsConstructor
public class OwnRecordsDeleteJobAccessPolicy implements JobAccessPolicy {
    private final JdbcTemplate jdbc;
    public JobKind kind() { return JobKind.OWN_RECORDS_DELETE; }
    public boolean canSubmit(JobSubmission s) {
        var photos = s.cleanupScope().photoIds();
        var assets = OwnRecordsDeleteJobHandler.ids(s.input(), "assetIds");
        var visits = OwnRecordsDeleteJobHandler.ids(s.input(), "visitIds");
        var reviews = OwnRecordsDeleteJobHandler.ids(s.input(), "reviewIds");
        return Boolean.TRUE.equals(jdbc.query(con -> {
            var statement = con.prepareStatement("""
                    with me as (select m.id from trip_members m join trips t on t.id=m.trip_id
                                where m.trip_id=? and m.user_id=? and m.status='ACTIVE' and t.deleted_at is null)
                    select exists(select 1 from me)
                    and (select count(*) from photos p join assets a on a.id=p.asset_id
                         where p.id=any(?) and a.id=any(?) and p.trip_id=? and p.uploader_member_id=(select id from me)
                         and p.deleted_at is not null and a.status='DELETING')=cardinality(?::uuid[])
                    and (select count(*) from visits v where v.id=any(?) and v.trip_id=? and v.member_id=(select id from me)
                         and v.deleted_at is not null)=cardinality(?::uuid[])
                    and (select count(*) from reviews r where r.id=any(?) and r.visit_id=any(?))=cardinality(?::uuid[])
                    """);
            int i = 1;
            statement.setObject(i++, s.tripId());
            statement.setObject(i++, s.requestedByUserId());
            statement.setArray(i++, con.createArrayOf("uuid", photos.toArray()));
            statement.setArray(i++, con.createArrayOf("uuid", assets.toArray()));
            statement.setObject(i++, s.tripId());
            statement.setArray(i++, con.createArrayOf("uuid", photos.toArray()));
            statement.setArray(i++, con.createArrayOf("uuid", visits.toArray()));
            statement.setObject(i++, s.tripId());
            statement.setArray(i++, con.createArrayOf("uuid", visits.toArray()));
            statement.setArray(i++, con.createArrayOf("uuid", reviews.toArray()));
            statement.setArray(i++, con.createArrayOf("uuid", visits.toArray()));
            statement.setArray(i, con.createArrayOf("uuid", reviews.toArray()));
            return statement;
        }, rs -> rs.next() ? rs.getBoolean(1) : null));
    }
    public boolean canExecute(JobContext c) { return true; }
    public boolean canComplete(JobContext c) { return true; }
    public boolean canRead(UUID user, JobContext c) { return user.equals(c.submission().requestedByUserId()); }
    // JobService keeps only scope, completedCount and failedCount for cleanup kinds.
    public JsonNode publicResult(UUID user, JobContext c, JsonNode result) { return result; }
}
