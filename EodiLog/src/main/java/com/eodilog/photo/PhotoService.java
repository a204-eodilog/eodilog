package com.eodilog.photo;

import com.eodilog.asset.AssetErrorCode;
import com.eodilog.asset.AssetProperties;
import com.eodilog.asset.AssetRecordRepository;
import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.response.CreatedAtCursor;
import com.eodilog.global.common.response.PageResponse;
import com.eodilog.global.id.UuidV7;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.photo.dto.*;
import com.eodilog.place.service.PlaceReader;
import com.eodilog.trip.service.TripAccessChecker;
import com.eodilog.job.*;
import tools.jackson.databind.json.JsonMapper;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service @RequiredArgsConstructor
public class PhotoService {
    // Restrict only this domain: comfortably within java.sql.Timestamp and PostgreSQL timestamp bounds.
    private static final Instant MIN_TIMESTAMP = Instant.parse("0001-01-01T00:00:00Z");
    private static final Instant MAX_TIMESTAMP = Instant.parse("9999-12-31T23:59:59.999999Z");
    private final JdbcTemplate jdbc;
    private final TripAccessChecker access;
    private final AssetRecordRepository assets;
    private final IdempotencyService idempotency;
    private final AssetProperties properties;
    private final PlaceReader places;
    private final Clock clock;
    private final JobService jobs;
    private final JsonMapper json;
    private static final java.util.Set<String> TOPICS = java.util.Set.of("LANDSCAPE", "FOOD", "PEOPLE", "OTHER");
    public static final String PHOTO_SELECT = "select photos.*, array(select topic from photo_topics where photo_id=photos.id order by topic) as topics from photos";

    @Transactional
    public PhotoBatchResponse createBatch(UUID user, UUID trip, String key, CreatePhotoBatchRequest request) {
        if (request.fileCount() > 50) throw new BusinessException(AssetErrorCode.INPUT_LIMIT_EXCEEDED);
        idempotency.validateKey(key);
        var member = access.requireActiveMemberForUpdate(trip, user).member();
        return idempotency.execute(user, "POST /api/v1/trips/" + trip + "/photo-upload-batches", key, request,
                PhotoBatchResponse.class, HttpStatus.CREATED, () -> {
                    var id = UuidV7.generate();
                    var now = clock.instant();
                    jdbc.update("""
                            insert into photo_upload_batches(id,trip_id,created_by_member_id,file_count,created_at,expires_at)
                            values(?,?,?,?,?,?)""", id, trip, member.getId(), request.fileCount(), Timestamp.from(now),
                            Timestamp.from(now.plus(properties.getBatchTtl())));
                    return new PhotoBatchResponse(id, trip, request.fileCount(), 0, now);
                });
    }

    // Caller holds the trip row lock; every mutation in a trip therefore uses one lock order.
    public void requireBatch(UUID batch, UUID trip, UUID member) {
        var deadlines = jdbc.query("""
                select expires_at from photo_upload_batches where id=? and trip_id=? and created_by_member_id=?
                """, (rs, row) -> rs.getTimestamp(1).toInstant(), batch, trip, member);
        if (deadlines.isEmpty()) throw new BusinessException(PhotoErrorCode.PHOTO_BATCH_NOT_FOUND);
        if (!clock.instant().isBefore(deadlines.getFirst())) throw new BusinessException(PhotoErrorCode.PHOTO_BATCH_EXPIRED);
    }

    @Transactional
    public PhotoResponse register(UUID user, UUID trip, CreatePhotoRequest request) {
        validateTimestamp(request.capturedAt());
        Instant capturedAt = request.capturedAt() == null ? null : request.capturedAt().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        var member = access.requireActiveMemberForUpdate(trip, user).member();
        var asset = assets.find(request.assetId(), true);
        if (!asset.ownerId().equals(user) || !trip.equals(asset.tripId())
                || !request.batchId().equals(asset.batchId()) || !asset.purpose().equals("TRIP_PHOTO"))
            throw new BusinessException(AssetErrorCode.ASSET_NOT_FOUND);
        if (!asset.status().equals("READY")) throw new BusinessException(AssetErrorCode.ASSET_NOT_READY);
        var existing = jdbc.query(PHOTO_SELECT + " where asset_id=? and deleted_at is null", PhotoService::map, asset.id());
        if (!existing.isEmpty()) {
            var photo = existing.getFirst();
            if (!photo.tripId().equals(trip) || !photo.batchId().equals(request.batchId())
                    || !photo.uploaderMemberId().equals(member.getId())
                    || !Objects.equals(photo.placeId(), request.placeId()) || !Objects.equals(photo.capturedAt(), capturedAt))
                throw new BusinessException(PhotoErrorCode.ASSET_ALREADY_REGISTERED);
            return photo;
        }
        requireBatch(request.batchId(), trip, member.getId());
        if (request.placeId() != null && places.find(request.placeId()).isEmpty())
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
        if (jdbc.update("""
                update photo_upload_batches set registered_count=registered_count+1
                where id=? and registered_count<file_count""", request.batchId()) != 1)
            throw new BusinessException(PhotoErrorCode.PHOTO_BATCH_FULL);
        UUID id = UuidV7.generate();
        jdbc.update("""
                insert into photos(id,batch_id,trip_id,uploader_member_id,asset_id,place_id,captured_at,created_at)
                values(?,?,?,?,?,?,?,?)""", id, request.batchId(), trip, member.getId(), asset.id(), request.placeId(),
                capturedAt == null ? null : Timestamp.from(capturedAt), Timestamp.from(clock.instant()));
        return jdbc.queryForObject(PHOTO_SELECT + " where id=?", PhotoService::map, id);
    }

    @Transactional
    public PhotoResponse update(UUID user, UUID trip, UUID id, UpdatePhotoRequest request) {
        var member = access.requireActiveMemberForUpdate(trip, user).member();
        var rows = jdbc.query(PHOTO_SELECT + " where id=? and trip_id=? and uploader_member_id=? and deleted_at is null for update",
                PhotoService::map, id, trip, member.getId());
        if (rows.isEmpty()) throw new BusinessException(PhotoErrorCode.PHOTO_NOT_FOUND);
        if (request.getExpectedVersion() == null || request.getExpectedVersion() < 1 || (!request.sentPlace() && !request.sentTopics()))
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
        if (request.sentTopics() && (request.getTopics() == null || request.getTopics().size() > 4
                || request.getTopics().stream().anyMatch(t -> t == null || !TOPICS.contains(t))
                || new java.util.HashSet<>(request.getTopics()).size() != request.getTopics().size()))
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
        if (request.sentPlace() && request.getPlaceId() != null && places.find(request.getPlaceId()).isEmpty())
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
        var photo = rows.getFirst();
        if (photo.version() != request.getExpectedVersion()) throw new BusinessException(PhotoErrorCode.VERSION_CONFLICT);
        jdbc.update("update photos set place_id=?,place_manually_edited=place_manually_edited or ?,topics_manually_edited=topics_manually_edited or ?,version=version+1 where id=?",
                request.sentPlace() ? request.getPlaceId() : photo.placeId(), request.sentPlace(), request.sentTopics(), id);
        if (request.sentTopics()) {
            jdbc.update("delete from photo_topics where photo_id=?", id);
            for (String topic : request.getTopics()) jdbc.update("insert into photo_topics(photo_id,topic,source) values(?,?,'MANUAL')", id, topic);
        }
        return jdbc.queryForObject(PHOTO_SELECT + " where id=?", PhotoService::map, id);
    }

    @Transactional
    public JobRef delete(UUID user, UUID trip, UUID id) {
        var member = access.requireActiveMemberForUpdate(trip, user).member();
        var previous = jdbc.query("select r.job_id,j.status from photo_delete_requests r join jobs j on j.id=r.job_id where r.photo_id=? and r.trip_id=? and r.requested_by_user_id=?",
                (rs, row) -> new JobRef(rs.getObject(1, UUID.class), JobStatus.valueOf(rs.getString(2)), "/api/v1/jobs/" + rs.getObject(1)), id, trip, user);
        if (!previous.isEmpty()) return previous.getFirst();
        var rows = jdbc.query(PHOTO_SELECT + " where id=? and trip_id=? and uploader_member_id=? and deleted_at is null for update",
                PhotoService::map, id, trip, member.getId());
        if (rows.isEmpty()) throw new BusinessException(PhotoErrorCode.PHOTO_NOT_FOUND);
        var asset = assets.find(rows.getFirst().assetId(), true);
        var now = clock.instant();
        jdbc.update("update photos set deleted_at=?,version=version+1 where id=?", Timestamp.from(now), id);
        jdbc.update("update assets set status='DELETING',deleted_at=? where id=?", Timestamp.from(now), asset.id());
        var input = json.createObjectNode().put("photoId", id.toString()).put("assetId", asset.id().toString())
                .put("objectKey", asset.objectKey()).put("displayKey", asset.displayKey());
        var ref = jobs.submit(new JobSubmission(user, JobKind.PHOTO_DELETE, trip, input, null,
                new CleanupScope(List.of(id), List.of(), now)));
        jdbc.update("insert into photo_delete_requests(photo_id,trip_id,requested_by_user_id,job_id) values(?,?,?,?)", id, trip, user, ref.jobId());
        return ref;
    }

    @Transactional(readOnly = true, isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public PhotoSummaryResponse summary(UUID user, UUID trip) {
        access.requireActiveMember(trip, user);
        long total = jdbc.queryForObject("select count(*) from photos where trip_id=? and deleted_at is null", Long.class, trip);
        long unplaced = jdbc.queryForObject("select count(*) from photos where trip_id=? and deleted_at is null and place_id is null", Long.class, trip);
        var topics = jdbc.query("select t.topic,count(*) from photo_topics t join photos p on p.id=t.photo_id where p.trip_id=? and p.deleted_at is null group by t.topic order by t.topic",
                (rs,row) -> new PhotoSummaryResponse.TopicCount(rs.getString(1),rs.getLong(2)), trip);
        var counts = jdbc.query("select place_id,count(*) from photos where trip_id=? and deleted_at is null and place_id is not null group by place_id order by place_id",
                (rs,row) -> new PhotoSummaryResponse.PlaceCount(rs.getObject(1,UUID.class),rs.getLong(2)), trip);
        var groups = jdbc.query("select group_id,count(*) from photos where trip_id=? and deleted_at is null and group_id is not null group by group_id order by group_id",
                (rs,row) -> new PhotoSummaryResponse.GroupCount(rs.getObject(1,UUID.class),rs.getLong(2)), trip);
        return new PhotoSummaryResponse(total, unplaced, topics, counts, groups);
    }

    @Transactional(readOnly = true)
    public PageResponse<PhotoResponse> list(UUID user, UUID trip, String topic, UUID group, String cursor, int limit) {
        access.requireActiveMember(trip, user);
        CreatedAtCursor after = cursor == null || cursor.isBlank() ? null : CreatedAtCursor.decode(cursor);
        if (after != null) validateTimestamp(after.createdAt());
        if (topic != null && !TOPICS.contains(topic)) throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
        String sql = PHOTO_SELECT + " where trip_id=? and deleted_at is null";
        List<Object> params = new ArrayList<>();
        params.add(trip);
        if (group != null) { sql += " and group_id=?"; params.add(group); }
        if (topic != null) {
            sql += " and exists(select 1 from photo_topics t where t.photo_id=photos.id and t.topic=?)";
            params.add(topic);
        }
        if (after != null) {
            sql += " and (created_at,id)<(?,?)";
            params.add(Timestamp.from(after.createdAt())); params.add(after.id());
        }
        sql += " order by created_at desc,id desc limit ?";
        params.add(limit + 1);
        var rows = jdbc.query(sql, (rs, row) -> new PhotoRow(map(rs, row), rs.getTimestamp("created_at").toInstant()), params.toArray());
        boolean more = rows.size() > limit;
        var page = more ? rows.subList(0, limit) : rows;
        String next = more ? new CreatedAtCursor(page.getLast().createdAt(), page.getLast().photo().id()).encode() : null;
        return PageResponse.of(page.stream().map(PhotoRow::photo).toList(), next, more);
    }

    private record PhotoRow(PhotoResponse photo, Instant createdAt) { }
    private static void validateTimestamp(Instant instant) {
        if (instant != null && (instant.isBefore(MIN_TIMESTAMP) || instant.isAfter(MAX_TIMESTAMP)))
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
    }
    public static PhotoResponse map(ResultSet rs, int row) throws SQLException {
        Timestamp captured = rs.getTimestamp("captured_at");
        return new PhotoResponse(rs.getObject("id", UUID.class), rs.getObject("asset_id", UUID.class),
                rs.getObject("trip_id", UUID.class), rs.getObject("batch_id", UUID.class), rs.getObject("uploader_member_id", UUID.class),
                rs.getObject("place_id", UUID.class), captured == null ? null : captured.toInstant(),
                java.util.Arrays.stream((Object[]) rs.getArray("topics").getArray()).map(Object::toString).toList(), rs.getObject("group_id",UUID.class), rs.getLong("version"));
    }
}
