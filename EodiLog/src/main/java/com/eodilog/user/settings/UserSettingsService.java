package com.eodilog.user.settings;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.user.settings.UserSettings.Ai;
import com.eodilog.user.settings.UserSettings.AiMode;
import com.eodilog.user.settings.UserSettings.Notifications;
import com.eodilog.user.settings.UserSettings.WeatherMode;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserSettingsService {
    private final JdbcTemplate jdbc;

    public UserSettingsService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional
    public UserSettings get(UUID userId) {
        initialize(userId);
        return read(userId, false);
    }

    @Transactional
    public UserSettings patch(UUID userId, SettingsPatch patch) {
        initialize(userId);
        UserSettings current = read(userId, true);
        if (patch.expectedVersion() == null || patch.expectedVersion() < 1 || patch.hasExplicitNull()) {
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
        }
        if (current.version() != patch.expectedVersion()) {
            throw new BusinessException(SettingsErrorCode.VERSION_CONFLICT);
        }
        SettingsPatch.Ai aiPatch = patch.ai();
        SettingsPatch.Notifications notificationPatch = patch.notifications();
        Ai oldAi = current.ai();
        Notifications oldNotifications = current.notifications();
        Ai ai = new Ai(
                aiPatch != null && aiPatch.photoClassification() != null ? aiPatch.photoClassification() : oldAi.photoClassification(),
                aiPatch != null && aiPatch.visitDetection() != null ? aiPatch.visitDetection() : oldAi.visitDetection(),
                aiPatch != null && aiPatch.placeExtraction() != null ? aiPatch.placeExtraction() : oldAi.placeExtraction(),
                aiPatch != null && aiPatch.checklist() != null ? aiPatch.checklist() : oldAi.checklist(),
                aiPatch != null && aiPatch.weather() != null ? aiPatch.weather() : oldAi.weather());
        Notifications notifications = new Notifications(
                notificationPatch != null && notificationPatch.followRequests() != null ? notificationPatch.followRequests() : oldNotifications.followRequests(),
                notificationPatch != null && notificationPatch.voteCourse() != null ? notificationPatch.voteCourse() : oldNotifications.voteCourse(),
                notificationPatch != null && notificationPatch.tripChanges() != null ? notificationPatch.tripChanges() : oldNotifications.tripChanges());
        if (ai.equals(oldAi) && notifications.equals(oldNotifications)) return current;
        jdbc.update("""
                UPDATE user_settings SET photo_classification_mode=?, visit_detection_mode=?, extraction_mode=?,
                    checklist_mode=?, weather_mode=?, follow_requests_enabled=?, vote_course_enabled=?,
                    trip_changes_enabled=?, version=version+1, updated_at=CURRENT_TIMESTAMP WHERE user_id=?""",
                ai.photoClassification().name(), ai.visitDetection().name(), ai.placeExtraction().name(),
                ai.checklist().name(), ai.weather().name(), notifications.followRequests(), notifications.voteCourse(),
                notifications.tripChanges(), userId);
        return new UserSettings(current.version() + 1, ai, notifications);
    }

    private void initialize(UUID userId) {
        // Only active, enrolled users can acquire settings, including a freshly initialized row.
        int inserted = jdbc.update("""
                INSERT INTO user_settings (user_id)
                SELECT id FROM users WHERE id=? AND status='ACTIVE' AND profile_completed=true
                ON CONFLICT (user_id) DO NOTHING""", userId);
        if (inserted == 0) {
            Long eligible = jdbc.queryForObject("SELECT count(*) FROM users WHERE id=? AND status='ACTIVE' AND profile_completed=true",
                    Long.class, userId);
            if (eligible == null || eligible == 0) throw new BusinessException(CommonErrorCode.FORBIDDEN);
        }
    }

    private UserSettings read(UUID userId, boolean lock) {
        String sql = "SELECT * FROM user_settings WHERE user_id=?" + (lock ? " FOR UPDATE" : "");
        return jdbc.queryForObject(sql, (rs, row) -> map(rs), userId);
    }

    private UserSettings map(ResultSet rs) throws SQLException {
        return new UserSettings(rs.getLong("version"),
                new Ai(AiMode.valueOf(rs.getString("photo_classification_mode")),
                        AiMode.valueOf(rs.getString("visit_detection_mode")),
                        AiMode.valueOf(rs.getString("extraction_mode")),
                        AiMode.valueOf(rs.getString("checklist_mode")),
                        WeatherMode.valueOf(rs.getString("weather_mode"))),
                new Notifications(rs.getBoolean("follow_requests_enabled"), rs.getBoolean("vote_course_enabled"),
                        rs.getBoolean("trip_changes_enabled")));
    }
}
