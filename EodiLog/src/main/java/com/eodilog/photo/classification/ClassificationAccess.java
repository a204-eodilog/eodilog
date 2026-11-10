package com.eodilog.photo.classification;

import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component @RequiredArgsConstructor
public class ClassificationAccess {
    private final JdbcTemplate jdbc;
    public boolean active(UUID trip,UUID user) {
        return trip!=null && user!=null && Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from trips t join trip_members m on m.trip_id=t.id where t.id=? and t.deleted_at is null and m.user_id=? and m.status='ACTIVE')",Boolean.class,trip,user));
    }
    public boolean disabled(UUID user) {
        return jdbc.queryForList("select photo_classification_mode from user_settings where user_id=?",String.class,user).contains("OFF");
    }
    public boolean allowed(UUID trip,UUID user) { return active(trip,user) && !disabled(user); }
}
