package com.eodilog.asset.service;

import com.eodilog.asset.*;
import com.eodilog.asset.domain.AssetPurpose;
import com.eodilog.asset.domain.ImageFormat;
import com.eodilog.global.storage.ObjectStorage;
import com.eodilog.global.storage.StorageProperties;
import com.eodilog.asset.dto.*;
import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.id.UuidV7;
import com.eodilog.photo.PhotoService;
import com.eodilog.trip.service.TripAccessChecker;
import java.sql.Timestamp;
import java.time.Clock;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.List;
import java.util.Locale;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import java.util.concurrent.locks.ReentrantLock;
import java.io.InputStream;
import java.io.IOException;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

@Service @RequiredArgsConstructor
public class AssetService {
    private final AssetRecordRepository repository;
    private final JdbcTemplate jdbc;
    private final ObjectStorage storage;
    private final ImageSanitizer sanitizer;
    private final AssetProperties properties;
    private final TripAccessChecker access;
    private final PhotoService photos;
    private final Clock clock;
    private final JsonMapper json;
    private final StorageProperties storageProperties;
    // One full image operation per application instance bounds heap/native pressure without queuing callers.
    private final ReentrantLock completionCapacity = new ReentrantLock();

    @Transactional
    public UploadIntentResponse create(UUID user, UploadIntentRequest request) {
        if (request.purpose() == null) throw invalid("purpose");
        var format = ImageFormat.fromContentType(request.contentType());
        if (format.isEmpty() || !request.purpose().accepts(format.get())) throw invalid("contentType");
        if (request.byteSize() == null || request.byteSize() < 1 || request.byteSize() > properties.getMaxBytes()) throw invalid("byteSize");
        boolean tripPhoto = request.purpose() == AssetPurpose.TRIP_PHOTO;
        if (!tripPhoto && request.tripId() != null) throw invalid("tripId");
        if (!tripPhoto && request.batchId() != null) throw invalid("batchId");
        if (tripPhoto) {
            if (request.tripId() == null) throw invalid("tripId");
            var member = access.requireActiveMemberForUpdate(request.tripId(), user).member();
            if (request.batchId() != null) photos.requireBatch(request.batchId(), request.tripId(), member.getId());
        }
        String contentType = request.contentType().strip().toLowerCase(Locale.ROOT);
        UUID id = UuidV7.generate();
        var now = clock.instant();
        var expires = now.plus(storageProperties.uploadUrlTtl());
        String key = "uploads/" + id, display = "display/" + id;
        var upload = storage.presignUpload(key, contentType, request.byteSize(), storageProperties.uploadUrlTtl());
        jdbc.update("""
                insert into assets(id, owner_user_id, trip_id, upload_batch_id, purpose, object_key, display_key,
                content_type, byte_size, created_at, upload_expires_at, expires_at)
                values (?,?,?,?,?,?,?,?,?,?,?,?)""", id, user, request.tripId(), request.batchId(), request.purpose().name(), key, display,
                contentType, request.byteSize(), Timestamp.from(now), Timestamp.from(expires),
                Timestamp.from(now.plus(properties.getIncompleteTtl())));
        return new UploadIntentResponse(id, upload.url(), upload.method(), upload.headers(), expires);
    }

    @Transactional
    public AssetResponse complete(UUID user, UUID id) {
        acquireCapacity(); // Before trip/asset locks: same-trip callers must not queue behind a decode.
        try {
        var asset = lockOwned(user, id);
        if (asset.status().equals("READY") && asset.displayContentType() != null) return asset.response();
        if (!Set.of("PENDING", "READY").contains(asset.status())) throw new BusinessException(com.eodilog.asset.exception.AssetErrorCode.ASSET_NOT_PENDING);
        if (asset.status().equals("PENDING") && !clock.instant().isBefore(asset.expiresAt()))
            throw new BusinessException(AssetErrorCode.UPLOAD_EXPIRED);
        return sanitize(asset);
        } finally { completionCapacity.unlock(); }
    }

    private AssetResponse sanitize(AssetRecordRepository.Asset asset) {
        acquireCapacity(); // Reentrant for complete and the authorized lazy-download path.
        try {
            if (storage.head(asset.objectKey()).isEmpty()) throw new BusinessException(com.eodilog.asset.exception.AssetErrorCode.UPLOAD_NOT_FOUND);
            ImageSanitizer.Result clean;
            try {
                byte[] bytes = storage.read(asset.objectKey(), properties.getMaxBytes());
                if (bytes.length != asset.byteSize()) throw new BusinessException(AssetErrorCode.INVALID_ASSET);
                clean = sanitizer.sanitize(bytes, "image/heif".equals(asset.contentType()) ? "image/heic" : asset.contentType());
            } catch (BusinessException ex) {
                if (ex.getErrorCode() != AssetErrorCode.INVALID_ASSET) throw ex;
                // Preserve historical READY data even if the old signature-only validator accepted a bad file.
                if (asset.status().equals("PENDING")) storage.delete(asset.objectKey());
                throw new BusinessException(com.eodilog.asset.exception.AssetErrorCode.UPLOAD_MISMATCH);
            }
            // Upload URLs only sign uploads/*; no client can overwrite the separately keyed sanitized pixels.
            storage.write(asset.displayKey(), clean.bytes(), clean.contentType());
            jdbc.update("update assets set status='READY', display_content_type=?, metadata_json=?::jsonb where id=?",
                    clean.contentType(), json.writeValueAsString(clean.metadata()), asset.id());
            return repository.find(asset.id(), false).response();
        } finally { completionCapacity.unlock(); }
    }

    @Transactional
    public void cancel(UUID user, UUID id) {
        var asset = lockOwned(user, id);
        if (asset.status().equals("CANCELLED")) return;
        if (!asset.status().equals("PENDING")) throw new BusinessException(com.eodilog.asset.exception.AssetErrorCode.ASSET_NOT_PENDING);
        storage.delete(asset.objectKey());
        storage.delete(asset.displayKey());
        jdbc.update("update assets set status='CANCELLED', deleted_at=? where id=?", Timestamp.from(clock.instant()), id);
    }

    public record Download(InputStream body, long byteSize, String contentType) { }

    @Transactional
    public Download download(UUID user, UUID id, UUID feedId) {
        var asset = repository.find(id, false);
        // Feeds are outside this feature; do not let a feedId bypass current internal access rules.
        if (feedId != null) throw new BusinessException(AssetErrorCode.ASSET_NOT_FOUND);
        if (asset.tripId() == null) {
            if (!asset.purpose().equals("PROFILE") && !asset.ownerId().equals(user)) throw new BusinessException(AssetErrorCode.ASSET_NOT_FOUND);
        } else {
            requireDownloadAccess(asset.tripId(), user, false);
            if (asset.batchId() != null && jdbc.queryForObject("select count(*) from photos where asset_id=? and trip_id=? and deleted_at is null",
                    Long.class, id, asset.tripId()) == 0) throw new BusinessException(AssetErrorCode.ASSET_NOT_FOUND);
        }
        if (!asset.status().equals("READY")) throw new BusinessException(AssetErrorCode.ASSET_NOT_FOUND);
        if (asset.displayContentType() == null) {
            acquireCapacity();
            try {
            // Preserve legacy READY rows without serving historical signature-only originals.
            if (asset.tripId() != null) requireDownloadAccess(asset.tripId(), user, true);
            asset = repository.find(id, true);
            if (asset.displayContentType() == null) sanitize(asset);
            asset = repository.find(id, false);
            } finally { completionCapacity.unlock(); }
        }
        var display = storage.head(asset.displayKey()).orElseThrow(() -> new BusinessException(AssetErrorCode.ASSET_NOT_FOUND));
        if (display.byteSize() < 0 || display.byteSize() > properties.getMaxBytes() * 4)
            throw new BusinessException(AssetErrorCode.INVALID_ASSET);
        return new Download(bounded(storage.open(asset.displayKey()), display.byteSize()), display.byteSize(), asset.displayContentType());
    }

    private void acquireCapacity() {
        if (!completionCapacity.tryLock()) throw new BusinessException(AssetErrorCode.IMAGE_PROCESSOR_UNAVAILABLE);
    }

    private InputStream bounded(InputStream source, long length) {
        return new InputStream() {
            private long remaining = length;
            @Override public int read() throws IOException {
                if (remaining == 0) return -1;
                int value = source.read(); if (value >= 0) remaining--; return value;
            }
            @Override public int read(byte[] bytes, int offset, int count) throws IOException {
                if (count == 0) return 0;
                if (remaining == 0) return -1;
                int read = source.read(bytes, offset, (int)Math.min(count, remaining));
                if (read > 0) remaining -= read; return read;
            }
            @Override public void close() throws IOException { source.close(); }
        };
    }

    private AssetRecordRepository.Asset lockOwned(UUID user, UUID id) {
        var observed = repository.find(id, false);
        if (!observed.ownerId().equals(user)) throw new BusinessException(AssetErrorCode.ASSET_NOT_FOUND);
        // Always lock trip before asset, matching registration, leave, deletion and cleanup ordering.
        if (observed.tripId() != null) access.requireActiveMemberForUpdate(observed.tripId(), user);
        return repository.find(id, true);
    }

    private BusinessException invalid(String field) {
        return new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
                List.of(new ErrorField(field, "파일 업로드 입력을 확인해 주세요.")));
    }

    private void requireDownloadAccess(UUID trip, UUID user, boolean lock) {
        try {
            if (lock) access.requireActiveMemberForUpdate(trip, user);
            else access.requireActiveMember(trip, user);
        } catch (BusinessException ex) {
            if (ex.getErrorCode() == com.eodilog.trip.exception.TripErrorCode.TRIP_NOT_FOUND)
                throw new BusinessException(AssetErrorCode.ASSET_NOT_FOUND);
            throw ex;
        }
    }
}
