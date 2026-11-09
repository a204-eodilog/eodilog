package com.eodilog.asset.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

// 업로드한 파일 하나. 바이트는 S3 objectKey에 있고, 이 행은 주인·용도·상태만 기록한다
// objectKey에 ID가 들어가므로 ID를 미리 정해 만든다(UUIDv7)
@Entity
@Table(name = "assets")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Asset {

	@Id
	private UUID id;

	private UUID ownerUserId;

	private UUID tripId;

	@Enumerated(EnumType.STRING)
	private AssetPurpose purpose;

	private String objectKey;

	private String contentType;

	private long byteSize;

	@Enumerated(EnumType.STRING)
	private AssetStatus status;

	private Instant createdAt;

	private Instant deletedAt;

	public static Asset pending(UUID id, UUID ownerUserId, UUID tripId, AssetPurpose purpose, String contentType,
			long byteSize, Instant now) {
		Asset asset = new Asset();
		asset.id = id;
		asset.ownerUserId = ownerUserId;
		asset.tripId = tripId;
		asset.purpose = purpose;
		// 파일 이름은 넣지 않는다. 용도/주인/파일ID만으로 정해 다른 사람의 키를 짐작해도 쓸모가 없게 한다
		asset.objectKey = purpose.keyPrefix() + "/" + ownerUserId + "/" + id;
		asset.contentType = contentType;
		asset.byteSize = byteSize;
		asset.status = AssetStatus.PENDING;
		asset.createdAt = now;
		return asset;
	}

	public boolean isOwnedBy(UUID userId) {
		return ownerUserId.equals(userId);
	}

	public void markReady() {
		this.status = AssetStatus.READY;
	}

	public void cancel(Instant now) {
		this.status = AssetStatus.CANCELLED;
		this.deletedAt = now;
	}

}
