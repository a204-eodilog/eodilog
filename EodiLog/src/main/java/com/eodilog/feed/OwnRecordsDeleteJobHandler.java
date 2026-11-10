package com.eodilog.feed;

import com.eodilog.global.storage.ObjectStorage;
import com.eodilog.job.*;
import java.sql.Array;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * OWN_RECORDS_DELETE: admission already tombstoned the frozen photos (asset DELETING) and visits.
 * execute removes the frozen assets' objects and persists each finished pair, like TRIP_DELETE.
 * complete removes reviews, then visits, then photo rows of the frozen IDs only. Asset keys stay for grace cleanup.
 * Already-gone targets are skipped, so a rerun for the same jobId is idempotent. Feeds are never touched.
 */
@Component
@RequiredArgsConstructor
public class OwnRecordsDeleteJobHandler implements JobHandler {
    static final List<String> INPUT = List.of("feedId", "assetIds", "visitIds", "reviewIds");
    private final JdbcTemplate jdbc;
    private final ObjectStorage storage;
    private final JsonMapper json;

    public JobKind kind() { return JobKind.OWN_RECORDS_DELETE; }

    public void validate(JobSubmission s) {
        var input = s.input();
        if (s.tripId() == null || s.baseVersion() != null || input.size() != INPUT.size()
                || !INPUT.stream().allMatch(input::has) || !input.path("feedId").isString()
                || !s.cleanupScope().messageIds().isEmpty()
                || ids(input, "assetIds").size() != s.cleanupScope().photoIds().size())
            throw new IllegalArgumentException("Invalid OWN_RECORDS_DELETE submission");
        UUID.fromString(input.path("feedId").asString());
        ids(input, "visitIds"); ids(input, "reviewIds");
    }

    public JobOutcome execute(JobContext c) {
        var pending = jdbc.query(con -> {
            var statement = con.prepareStatement("select id,object_key,display_key from assets where id=any(?) and status='DELETING' and objects_deleted=false order by id");
            statement.setArray(1, uuids(con, ids(c.submission().input(), "assetIds")));
            return statement;
        }, (rs, row) -> new String[]{rs.getString(1), rs.getString(2), rs.getString(3)});
        try {
            for (var asset : pending) {
                storage.delete(asset[1]);
                storage.delete(asset[2]);
                // execute runs outside the completion transaction: persist each finished pair for retries.
                jdbc.update("update assets set objects_deleted=true where id=?", UUID.fromString(asset[0]));
            }
        } catch (RuntimeException failure) {
            return JobOutcome.failed(JobFailure.TEMPORARY_FAILURE);
        }
        var input = c.submission().input();
        long count = c.submission().cleanupScope().photoIds().size() + input.path("visitIds").size() + input.path("reviewIds").size();
        return JobOutcome.succeeded(json.createObjectNode().put("scope", kind().name()).put("completedCount", count).put("failedCount", 0));
    }

    public void complete(JobContext c, JsonNode result) {
        var s = c.submission();
        var photos = s.cleanupScope().photoIds();
        var assets = ids(s.input(), "assetIds");
        var visits = ids(s.input(), "visitIds");
        var reviews = ids(s.input(), "reviewIds");
        // Serialize with trip deletion and other trip mutations: same trip-first lock order.
        jdbc.query("select id from trips where id=? for update", (rs, row) -> rs.getObject(1), s.tripId());
        // Reviews before visits (FK). Frozen visits were tombstoned at admission, so no review can be added to them later.
        // Visit candidates point at the purged photos/visits: drop links to those photos and candidates of those visits first.
        update("delete from visit_candidate_photos where photo_id=any(?) or candidate_id in (select id from visit_candidates where visit_id=any(?))", photos, visits);
        update("delete from visit_candidates where visit_id=any(?)", visits);
        update("delete from reviews where id=any(?) or visit_id=any(?)", reviews, visits);
        update("delete from visits where id=any(?) and trip_id=? and deleted_at is not null", visits, s.tripId());
        update("delete from photo_topics where photo_id=any(?)", photos);
        update("delete from photos where id=any(?) and trip_id=? and asset_id=any(?) and deleted_at is not null", photos, s.tripId(), assets);
        update("update assets set objects_deleted=true where id=any(?) and status='DELETING'", assets);
    }

    private void update(String sql, Object... args) {
        jdbc.update(con -> {
            var statement = con.prepareStatement(sql);
            for (int i = 0; i < args.length; i++) {
                if (args[i] instanceof List<?> list) statement.setArray(i + 1, uuids(con, list));
                else statement.setObject(i + 1, args[i]);
            }
            return statement;
        });
    }
    private static Array uuids(java.sql.Connection con, List<?> ids) throws java.sql.SQLException {
        return con.createArrayOf("uuid", ids.toArray());
    }
    static List<UUID> ids(JsonNode input, String field) {
        var node = input.path(field);
        if (!node.isArray()) throw new IllegalArgumentException("Invalid " + field);
        var result = new ArrayList<UUID>();
        node.forEach(v -> {
            if (!v.isString()) throw new IllegalArgumentException("Invalid " + field);
            result.add(UUID.fromString(v.asString()));
        });
        return result;
    }
}
