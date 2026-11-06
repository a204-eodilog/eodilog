package com.eodilog.asset.dto;

import com.eodilog.asset.domain.Asset;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

@Schema(description = "업로드한 파일. 파일 바이트는 GET /assets/{assetId}/download로 받는다")
public record AssetResponse(
		@Schema(description = "파일 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6ed0",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID id,

		@Schema(description = "용도(PROFILE·CAPTURE·TRIP_PHOTO)", example = "TRIP_PHOTO",
				requiredMode = Schema.RequiredMode.REQUIRED)
		String purpose,

		@Schema(description = "상태(PENDING·READY·DELETING·DELETED·CANCELLED)", example = "READY",
				requiredMode = Schema.RequiredMode.REQUIRED)
		String status,

		@Schema(description = "파일 형식", example = "image/jpeg", requiredMode = Schema.RequiredMode.REQUIRED)
		String contentType,

		@Schema(description = "파일 크기(바이트)", example = "2483017", requiredMode = Schema.RequiredMode.REQUIRED)
		long byteSize,

		@Schema(description = "여행 ID. 여행 사진이 아니면 null", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
		UUID tripId
) {

	public static AssetResponse of(Asset asset) {
		return new AssetResponse(asset.getId(), asset.getPurpose().name(), asset.getStatus().name(),
				asset.getContentType(), asset.getByteSize(), asset.getTripId());
	}

}
