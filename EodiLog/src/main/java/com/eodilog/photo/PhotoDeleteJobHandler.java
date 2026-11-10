package com.eodilog.photo;

import com.eodilog.global.storage.ObjectStorage;
import com.eodilog.job.*;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Component @RequiredArgsConstructor
public class PhotoDeleteJobHandler implements JobHandler {
    private final JdbcTemplate jdbc;
    private final ObjectStorage storage;
    private final JsonMapper json;
    public JobKind kind() { return JobKind.PHOTO_DELETE; }
    public void validate(JobSubmission s) {
        var input = s.input();
        if (s.tripId() == null || s.baseVersion() != null || input.size() != 4
                || s.cleanupScope().photoIds().size() != 1 || !s.cleanupScope().messageIds().isEmpty()
                || !s.cleanupScope().photoIds().getFirst().toString().equals(input.path("photoId").asString())
                || !input.path("assetId").isString() || !input.path("objectKey").isString() || !input.path("displayKey").isString()
                || input.path("objectKey").asString().isBlank() || input.path("displayKey").asString().isBlank())
            throw new IllegalArgumentException("Invalid PHOTO_DELETE submission");
        UUID.fromString(input.path("assetId").asString());
    }
    public JobOutcome execute(JobContext c) {
        // Only the approved immutable keys; never look up a replacement or broaden to a member's photos.
        try {
            storage.delete(c.submission().input().path("objectKey").asString());
            storage.delete(c.submission().input().path("displayKey").asString());
        } catch (RuntimeException failure) {
            return JobOutcome.failed(JobFailure.TEMPORARY_FAILURE);
        }
        return JobOutcome.succeeded(json.createObjectNode().put("scope", kind().name()).put("completedCount", 1).put("failedCount", 0));
    }
    public void complete(JobContext c, JsonNode result) {
        UUID photo = c.submission().cleanupScope().photoIds().getFirst();
        // Serialize with trip deletion, which removes the same children in FK order.
        jdbc.query("select id from trips where id=? for update", (rs, row) -> rs.getObject(1), c.submission().tripId());
        jdbc.update("delete from photo_topics where photo_id=?", photo);
        // Candidates were invalidated at approval; only the evidence link to the purged photo goes.
        jdbc.update("delete from visit_candidate_photos where photo_id=?", photo);
        jdbc.update("delete from photos where id=? and trip_id=? and asset_id=? and deleted_at is not null", photo,
                c.submission().tripId(), UUID.fromString(c.submission().input().path("assetId").asString()));
        jdbc.update("update assets set objects_deleted=true where id=? and status='DELETING'",
                UUID.fromString(c.submission().input().path("assetId").asString()));
        // Keep asset keys/status for repeated cleanup after signed PUT expiry and the grace period.
    }
}
