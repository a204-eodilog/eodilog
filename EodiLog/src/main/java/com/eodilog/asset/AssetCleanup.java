package com.eodilog.asset;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.storage.ObjectStorage;
import java.sql.Timestamp;
import java.time.Clock;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/** Retry external deletion before committing state. Each row is independent so one failed object cannot block other cleanup. */
@Slf4j @Component @RequiredArgsConstructor
@ConditionalOnProperty(name = "app.assets.cleanup-enabled", havingValue = "true", matchIfMissing = true)
public class AssetCleanup {
    private final JdbcTemplate jdbc;
    private final ObjectStorage storage;
    private final Clock clock;
    private final TransactionTemplate transactions;

    @Scheduled(fixedDelayString = "${app.assets.cleanup-delay:PT1H}")
    public void clean() {
        var ids = jdbc.query("""
                select id from assets where (status='DELETING' and upload_expires_at<=?) or (expires_at<=? and
                (status in ('PENDING','CANCELLED') or (status='READY' and display_content_type is not null and upload_batch_id is not null and purpose='TRIP_PHOTO' and not exists (select 1 from photos p where p.asset_id=assets.id))))
                order by expires_at""", (rs, row) -> rs.getObject(1, UUID.class), Timestamp.from(clock.instant()), Timestamp.from(clock.instant()));
        for (UUID id : ids) {
            try {
                transactions.executeWithoutResult(status -> {
                    var assets = jdbc.query("select * from assets where id=? for update skip locked", AssetRecordRepository::map, id);
                    if (assets.isEmpty()) return;
                    var asset = assets.getFirst();
                    if (asset.status().equals("DELETING")) {
                        if (asset.uploadExpiresAt().isAfter(clock.instant())) return;
                    } else if (!java.util.Set.of("PENDING", "CANCELLED", "READY").contains(asset.status())
                            || asset.expiresAt().isAfter(clock.instant())) return;
                    if (asset.status().equals("READY") && (!asset.purpose().equals("TRIP_PHOTO") || asset.batchId() == null || asset.displayContentType() == null)) return;
                    if (jdbc.queryForObject("select count(*) from photos where asset_id=?", Long.class, id) != 0) return;
                    storage.delete(asset.objectKey()); storage.delete(asset.displayKey());
                    if (asset.status().equals("DELETING")) {
                        // Requests signed before expiry can still be writing. Revisit keys throughout the grace period.
                        if (!asset.expiresAt().isAfter(clock.instant())) jdbc.update("delete from assets where id=?", id);
                    }
                    else jdbc.update("update assets set status='DELETED', deleted_at=? where id=?", Timestamp.from(clock.instant()), id);
                });
            } catch (RuntimeException ex) { logFailure(id, ex); }
        }
        // Raw originals can be removed after the signed PUT has expired; keep sanitized READY display objects.
        // Idempotent deletion also removes objects recreated by an outstanding PUT after completion/cancellation.
        var originals = jdbc.query("select * from assets where status='READY' and display_content_type is not null and (original_cleaned_at is null or original_cleaned_at<expires_at) and upload_expires_at<=? order by upload_expires_at",
                AssetRecordRepository::map, Timestamp.from(clock.instant()));
        for (var asset : originals) {
            try {
                storage.delete(asset.objectKey());
                jdbc.update("update assets set original_cleaned_at=? where id=?", Timestamp.from(clock.instant()), asset.id());
            }
            catch (RuntimeException ex) { logFailure(asset.id(), ex); }
        }
    }

    private void logFailure(UUID id, RuntimeException ex) {
        String code = ex instanceof BusinessException business ? business.getErrorCode().code() : "NONE";
        // Never log provider messages/URLs, headers, credentials, or the throwable (which includes its message).
        log.warn("Asset cleanup will retry asset {} exceptionClass={} errorCode={}", id, ex.getClass().getName(), code);
    }
}
