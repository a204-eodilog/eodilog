package com.eodilog.asset.service;

import com.eodilog.asset.domain.Asset;
import com.eodilog.asset.domain.AssetPurpose;
import com.eodilog.asset.domain.AssetStatus;
import com.eodilog.asset.domain.ImageFormat;
import com.eodilog.asset.dto.AssetResponse;
import com.eodilog.asset.dto.UploadIntentRequest;
import com.eodilog.asset.dto.UploadIntentResponse;
import com.eodilog.asset.exception.AssetErrorCode;
import com.eodilog.asset.repository.AssetRepository;
import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import com.eodilog.global.id.UuidV7;
import com.eodilog.global.storage.ObjectStorage;
import com.eodilog.global.storage.ObjectStorage.PresignedUpload;
import com.eodilog.global.storage.ObjectStorage.StoredObject;
import com.eodilog.global.storage.StorageProperties;
import com.eodilog.trip.domain.TripMember;
import com.eodilog.trip.repository.TripMemberRepository;
import com.eodilog.trip.repository.TripRepository;
import com.eodilog.trip.service.TripAccessChecker;
import java.io.InputStream;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

// 파일 업로드(명세 §7). 앱이 서명 URL로 S3에 직접 올리고, 서버는 기록·확인·권한 검사만 한다
// 저장소 호출(외부 I/O)은 DB 트랜잭션 밖에서 하고, 상태 전이만 짧은 트랜잭션에서 행을 잠근 채 한다
@Slf4j
@Service
public class AssetService {

	// 파일 1개 상한(Q-7, 2026-11-06 결정). AI 서버의 사진 상한과 같다
	public static final long MAX_BYTE_SIZE = 15L * 1024 * 1024;

	private final AssetRepository assetRepository;
	private final TripAccessChecker tripAccessChecker;
	private final TripRepository tripRepository;
	private final TripMemberRepository tripMemberRepository;
	private final ObjectStorage objectStorage;
	private final StorageProperties storageProperties;
	private final TransactionTemplate tx;
	private final TransactionTemplate readOnlyTx;
	private final Clock clock;

	public AssetService(AssetRepository assetRepository, TripAccessChecker tripAccessChecker,
			TripRepository tripRepository, TripMemberRepository tripMemberRepository, ObjectStorage objectStorage,
			StorageProperties storageProperties, PlatformTransactionManager transactionManager, Clock clock) {
		this.assetRepository = assetRepository;
		this.tripAccessChecker = tripAccessChecker;
		this.tripRepository = tripRepository;
		this.tripMemberRepository = tripMemberRepository;
		this.objectStorage = objectStorage;
		this.storageProperties = storageProperties;
		this.tx = new TransactionTemplate(transactionManager);
		this.readOnlyTx = new TransactionTemplate(transactionManager);
		this.readOnlyTx.setReadOnly(true);
		this.clock = clock;
	}

	public record Download(Asset asset, InputStream body) {
	}

	// 판정 순서: 입력 400 → TRIP_PHOTO면 ACTIVE 멤버 404 → PENDING 행 생성 → 서명 URL 발급(로컬 계산, 네트워크 없음)
	public UploadIntentResponse createUploadIntent(UUID userId, UploadIntentRequest request) {
		String contentType = validate(request);
		return tx.execute(status -> {
			if (request.purpose() == AssetPurpose.TRIP_PHOTO) {
				tripAccessChecker.requireActiveMember(request.tripId(), userId);
			}
			Asset asset = assetRepository.saveAndFlush(Asset.pending(UuidV7.generate(), userId, request.tripId(),
					request.purpose(), contentType, request.byteSize(), now()));
			PresignedUpload upload = objectStorage.presignUpload(asset.getObjectKey(), contentType, asset.getByteSize(),
					storageProperties.uploadUrlTtl());
			return new UploadIntentResponse(asset.getId(), upload.url(), upload.method(), upload.headers(),
					upload.expiresAt());
		});
	}

	// 판정 순서: 본인 파일 404 → 이미 READY면 그대로 200(재시도 안전) → PENDING 아니면 409 → 저장소에 없으면 409
	// → 크기·실제 형식이 요청과 다르면 올린 파일을 지우고 422(PENDING 유지, URL이 살아 있으면 다시 올릴 수 있음) → READY
	public AssetResponse complete(UUID userId, UUID assetId) {
		Asset asset = readOnlyTx.execute(status -> findOwned(userId, assetId));
		if (asset.getStatus() == AssetStatus.READY) {
			return AssetResponse.of(asset);
		}
		requirePending(asset);

		StoredObject stored = objectStorage.head(asset.getObjectKey())
				.orElseThrow(() -> new BusinessException(AssetErrorCode.UPLOAD_NOT_FOUND));
		Optional<ImageFormat> detected = stored.byteSize() == asset.getByteSize()
				? ImageFormat.detect(objectStorage.readPrefix(asset.getObjectKey(), ImageFormat.SIGNATURE_LENGTH))
				: Optional.empty();
		Optional<ImageFormat> declared = ImageFormat.fromContentType(asset.getContentType());
		if (detected.isEmpty() || !detected.equals(declared) || !asset.getPurpose().accepts(detected.get())) {
			deleteQuietly(asset.getObjectKey());
			throw new BusinessException(AssetErrorCode.UPLOAD_MISMATCH);
		}

		return tx.execute(status -> {
			Asset locked = assetRepository.findByIdForUpdate(assetId)
					.orElseThrow(() -> new BusinessException(AssetErrorCode.ASSET_NOT_FOUND));
			if (locked.getStatus() == AssetStatus.PENDING) {
				locked.markReady();
				assetRepository.flush();
			} else if (locked.getStatus() != AssetStatus.READY) {
				// 확인하는 사이에 취소됐다
				throw new BusinessException(AssetErrorCode.ASSET_NOT_PENDING);
			}
			return AssetResponse.of(locked);
		});
	}

	// PENDING 업로드 취소. 이미 취소한 파일은 다시 204. 확인을 마친 파일(READY)은 409, 사진 삭제 API로 지운다
	// 행을 먼저 CANCELLED로 커밋해 이후 complete를 막고, 저장소 객체는 그 뒤에 지운다
	public void cancel(UUID userId, UUID assetId) {
		Asset cancelled = tx.execute(status -> {
			Asset asset = assetRepository.findByIdForUpdate(assetId)
					.filter(found -> found.isOwnedBy(userId))
					.orElseThrow(() -> new BusinessException(AssetErrorCode.ASSET_NOT_FOUND));
			if (asset.getStatus() == AssetStatus.CANCELLED) {
				return null;
			}
			requirePending(asset);
			asset.cancel(now());
			assetRepository.flush();
			return asset;
		});
		if (cancelled != null) {
			deleteQuietly(cancelled.getObjectKey());
		}
	}

	// READY 파일만 내려준다. 주인은 항상, PROFILE은 로그인 사용자 누구나(프로필은 여러 화면에 보인다),
	// CAPTURE는 주인만, TRIP_PHOTO는 그 여행의 ACTIVE 멤버만. 볼 수 없는 파일은 없는 파일과 같은 404
	public Download download(UUID userId, UUID assetId) {
		Asset asset = readOnlyTx.execute(status -> assetRepository.findById(assetId)
				.filter(found -> found.getStatus() == AssetStatus.READY)
				.filter(found -> canRead(userId, found))
				.orElseThrow(() -> new BusinessException(AssetErrorCode.ASSET_NOT_FOUND)));
		return new Download(asset, objectStorage.open(asset.getObjectKey()));
	}

	private boolean canRead(UUID userId, Asset asset) {
		if (asset.isOwnedBy(userId)) {
			return true;
		}
		return switch (asset.getPurpose()) {
			case PROFILE -> true;
			case CAPTURE -> false;
			case TRIP_PHOTO -> tripRepository.findByIdAndDeletedAtIsNull(asset.getTripId()).isPresent()
					&& tripMemberRepository.findByTripIdAndUserId(asset.getTripId(), userId)
							.filter(TripMember::isActive).isPresent();
		};
	}

	// 남의 파일은 있는지조차 알리지 않는다
	private Asset findOwned(UUID userId, UUID assetId) {
		return assetRepository.findById(assetId)
				.filter(asset -> asset.isOwnedBy(userId))
				.orElseThrow(() -> new BusinessException(AssetErrorCode.ASSET_NOT_FOUND));
	}

	private void requirePending(Asset asset) {
		if (asset.getStatus() != AssetStatus.PENDING) {
			throw new BusinessException(AssetErrorCode.ASSET_NOT_PENDING);
		}
	}

	// 저장소 정리 실패는 응답을 바꾸지 않는다. 남은 객체는 버킷 수명 주기 규칙·정리 작업이 지운다
	private void deleteQuietly(String objectKey) {
		try {
			objectStorage.delete(objectKey);
		} catch (RuntimeException ex) {
			log.warn("저장소 객체 삭제 실패 objectKey={} cause={}", objectKey, ex.getClass().getSimpleName());
		}
	}

	// 정규화한 contentType을 돌려준다
	private String validate(UploadIntentRequest request) {
		List<ErrorField> errors = new ArrayList<>();
		AssetPurpose purpose = request.purpose();
		if (purpose == null) {
			errors.add(new ErrorField("purpose", "파일 용도를 보내 주세요. PROFILE, CAPTURE, TRIP_PHOTO 중 하나입니다."));
		}
		Optional<ImageFormat> format = ImageFormat.fromContentType(request.contentType());
		if (request.contentType() == null || request.contentType().isBlank()) {
			errors.add(new ErrorField("contentType", "파일 형식을 보내 주세요."));
		} else if (format.isEmpty() || (purpose != null && !purpose.accepts(format.get()))) {
			errors.add(new ErrorField("contentType", purpose == AssetPurpose.TRIP_PHOTO
					? "여행 사진은 JPG, PNG, HEIC만 올릴 수 있습니다."
					: "JPG, PNG 파일만 올릴 수 있습니다."));
		}
		if (request.byteSize() == null || request.byteSize() < 1) {
			errors.add(new ErrorField("byteSize", "파일 크기(바이트)를 1 이상으로 보내 주세요."));
		} else if (request.byteSize() > MAX_BYTE_SIZE) {
			errors.add(new ErrorField("byteSize", "파일은 15MB까지 올릴 수 있습니다."));
		}
		if (purpose == AssetPurpose.TRIP_PHOTO && request.tripId() == null) {
			errors.add(new ErrorField("tripId", "여행 사진은 여행 ID가 필요합니다."));
		} else if (purpose != null && purpose != AssetPurpose.TRIP_PHOTO && request.tripId() != null) {
			errors.add(new ErrorField("tripId", "여행 사진이 아닌 파일에는 여행 ID를 보내지 않습니다."));
		}
		if (request.batchId() != null) {
			errors.add(new ErrorField("batchId", "사진 묶음 업로드는 아직 지원하지 않습니다. batchId 없이 보내 주세요."));
		}
		if (!errors.isEmpty()) {
			throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
					List.copyOf(errors));
		}
		return request.contentType().strip().toLowerCase(Locale.ROOT);
	}

	private Instant now() {
		return clock.instant().truncatedTo(ChronoUnit.MICROS);
	}

}
