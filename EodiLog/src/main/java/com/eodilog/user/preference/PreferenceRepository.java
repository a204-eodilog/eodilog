package com.eodilog.user.preference;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Repository
@RequiredArgsConstructor
public class PreferenceRepository {
    private final JdbcTemplate jdbc;
    private final JsonMapper json;
    record User(boolean consent, Preferences.Scope scope, Instant updatedAt) {}
    User user(UUID id, boolean lock) {
        return jdbc.query("SELECT inference_consent,preference_sharing_scope,updated_at FROM users WHERE id=? AND status='ACTIVE' AND profile_completed=true" + (lock ? " FOR UPDATE" : ""),
                (r,n) -> new User(r.getBoolean(1), Preferences.Scope.valueOf(r.getString(2)), r.getTimestamp(3).toInstant()), id)
                .stream().findFirst().orElseThrow(() -> new BusinessException(CommonErrorCode.FORBIDDEN));
    }
    /** Saved-place writes must not start failing for users the preference feature does not apply to. */
    Optional<User> lockIfEligible(UUID id) {
        return jdbc.query("SELECT inference_consent,preference_sharing_scope,updated_at FROM users WHERE id=? AND status='ACTIVE' AND profile_completed=true FOR UPDATE",
                (r,n) -> new User(r.getBoolean(1), Preferences.Scope.valueOf(r.getString(2)), r.getTimestamp(3).toInstant()), id)
                .stream().findFirst();
    }
    List<Preferences.Item> items(UUID id, String source) {
        return jdbc.query("SELECT key,value FROM user_preferences WHERE user_id=? AND source=? ORDER BY position,key",
                (r,n) -> new Preferences.Item(r.getString(1),r.getString(2)), id,source);
    }
    void replace(UUID id, String source, List<Preferences.Item> items) {
        jdbc.update("DELETE FROM user_preferences WHERE user_id=? AND source=?",id,source);
        int position=0;
        for (var item:items) jdbc.update("INSERT INTO user_preferences(user_id,key,value,source,position) VALUES(?,?,?,?,?)",id,item.key(),item.value(),source,position++);
    }
    JsonNode places(UUID id) {
        var result=json.createArrayNode();
        jdbc.query("""
            SELECT p.id,p.name FROM places p JOIN (
              SELECT place_id FROM personal_bookmarks WHERE user_id=?
              UNION
              SELECT s.place_id FROM trip_place_saves s JOIN trip_members m ON m.id=s.saved_by_member_id
              WHERE m.user_id=?
            ) own ON own.place_id=p.id ORDER BY p.id
            """, (org.springframework.jdbc.core.RowCallbackHandler) r -> {
                result.addObject().put("id", r.getObject(1).toString()).put("name",r.getString(2)).putNull("category");
            }, id,id);
        return result;
    }
    static String fingerprint(JsonNode places) {
        StringJoiner ids=new StringJoiner(",");
        places.forEach(p -> ids.add(p.path("id").asString()));
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(ids.toString().getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    void initialize(UUID id) {
        jdbc.update("INSERT INTO user_preference_states(user_id,places_fingerprint) VALUES(?,?) ON CONFLICT DO NOTHING",id,fingerprint(places(id)));
    }
    String fingerprint(UUID id) { return jdbc.queryForObject("SELECT places_fingerprint FROM user_preference_states WHERE user_id=?",String.class,id); }
    long version(UUID id) { return jdbc.queryForObject("SELECT version FROM user_preference_states WHERE user_id=?",Long.class,id); }
    void bump(UUID id, Instant now) {
        jdbc.update("UPDATE user_preference_states SET version=version+1 WHERE user_id=?",id);
        jdbc.update("UPDATE users SET updated_at=? WHERE id=?",Timestamp.from(now),id);
    }
    void changePlaces(UUID id, String fingerprint) {
        jdbc.update("UPDATE user_preference_states SET places_fingerprint=? WHERE user_id=?",fingerprint,id);
        jdbc.update("DELETE FROM user_preference_rejections WHERE user_id=?",id);
    }
    List<String> rejected(UUID id) { return jdbc.query("SELECT key FROM user_preference_rejections WHERE user_id=? ORDER BY key",(r,n)->r.getString(1),id); }
    void reject(UUID id, String key) {
        jdbc.update("DELETE FROM user_preferences WHERE user_id=? AND source='INFERRED' AND key=?",id,key);
        jdbc.update("INSERT INTO user_preference_rejections(user_id,key) VALUES(?,?) ON CONFLICT DO NOTHING",id,key);
    }
    void settings(UUID id, Preferences.Write body) { jdbc.update("UPDATE users SET inference_consent=?,preference_sharing_scope=? WHERE id=?",body.allowInference(),body.sharingScope().name(),id); }
    JsonNode snapshot(UUID id) {
        var input=json.createObjectNode();
        input.put("userId",id.toString()); input.set("savedPlaces",places(id));
        input.set("explicitItems",json.valueToTree(items(id,"EXPLICIT")));
        input.set("rejectedKeys",json.valueToTree(rejected(id)));
        return input;
    }
    void tripScope(UUID memberId, Preferences.TripScope scope) { jdbc.update("UPDATE trip_members SET preference_scope=? WHERE id=?",scope.name(),memberId); }
}
