package com.eodilog.asset;

import com.eodilog.asset.dto.AssetResponse;
import com.eodilog.global.common.error.BusinessException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository @RequiredArgsConstructor
public class AssetRecordRepository {
    private final JdbcTemplate jdbc;
    public record Asset(UUID id, UUID ownerId, UUID tripId, UUID batchId, String purpose, String status,
            String objectKey, String displayKey, String contentType, String displayContentType, long byteSize,
            Instant expiresAt, Instant uploadExpiresAt) {
        public AssetResponse response() { return new AssetResponse(id, purpose, status, contentType, byteSize, tripId); }
    }
    public Asset find(UUID id, boolean lock) {
        return jdbc.query("select * from assets where id = ?" + (lock ? " for update" : ""),
                AssetRecordRepository::map, id).stream().findFirst()
                .orElseThrow(() -> new BusinessException(AssetErrorCode.ASSET_NOT_FOUND));
    }
    public static Asset map(ResultSet rs, int row) throws SQLException {
        return new Asset(rs.getObject("id", UUID.class), rs.getObject("owner_user_id", UUID.class),
                rs.getObject("trip_id", UUID.class), rs.getObject("upload_batch_id", UUID.class),
                rs.getString("purpose"), rs.getString("status"), rs.getString("object_key"), rs.getString("display_key"),
                rs.getString("content_type"), rs.getString("display_content_type"), rs.getLong("byte_size"),
                rs.getTimestamp("expires_at").toInstant(), rs.getTimestamp("upload_expires_at").toInstant());
    }
}
