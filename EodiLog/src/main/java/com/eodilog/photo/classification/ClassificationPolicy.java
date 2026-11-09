package com.eodilog.photo.classification;

import com.eodilog.job.*;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.JsonNodeFactory;

@Component @RequiredArgsConstructor
public class ClassificationPolicy implements JobAccessPolicy {
    private final ClassificationAccess access;
    private final JdbcTemplate jdbc;
    public JobKind kind() { return JobKind.PHOTO_CLASSIFICATION; }
    public boolean canSubmit(JobSubmission s) { return access.allowed(s.tripId(),s.requestedByUserId()); }
    public boolean canExecute(JobContext c) { return canSubmit(c.submission()); }
    public boolean canComplete(JobContext c) { return canSubmit(c.submission()); }
    public boolean canRead(UUID user,JobContext c) { return access.allowed(c.submission().tripId(),user) && canSubmit(c.submission()); }
    public JsonNode publicResult(UUID user,JobContext c,JsonNode stored) {
        Set<UUID> expected=new HashSet<>();
        for(var p:c.submission().input().path("photos")) expected.add(UUID.fromString(p.path("photoId").asString()));
        var valid=ClassificationResult.sanitize(stored,expected);
        var out=JsonNodeFactory.instance.objectNode();
        var photos=out.putArray("photos");
        Set<UUID> alive=new HashSet<>(jdbc.queryForList("select id from photos where trip_id=? and deleted_at is null and id=any(?)",UUID.class,
                c.submission().tripId(),expected.toArray(UUID[]::new)));
        for(var p:valid.path("photos")) if(alive.contains(UUID.fromString(p.path("photoId").asString()))) photos.add(p);
        return out;
    }
}
