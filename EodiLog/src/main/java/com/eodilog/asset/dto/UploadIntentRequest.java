package com.eodilog.asset.dto;

import com.eodilog.asset.domain.AssetPurpose;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

@Schema(description = "업로드 요청. 파일 바이트는 보내지 않고, 응답의 uploadUrl로 직접 올린다")
public record UploadIntentRequest(
		@Schema(description = "용도. PROFILE·CAPTURE는 JPG/PNG, TRIP_PHOTO는 JPG/PNG/HEIC", example = "TRIP_PHOTO",
				requiredMode = Schema.RequiredMode.REQUIRED)
		AssetPurpose purpose,

		@Schema(description = "여행 ID. TRIP_PHOTO일 때만 필수이며 다른 용도에는 보내지 않는다",
				example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
		UUID tripId,

		@Schema(description = "파일 형식. image/jpeg, image/png, image/heic(image/heif)", example = "image/jpeg",
				requiredMode = Schema.RequiredMode.REQUIRED)
		String contentType,

		@Schema(description = "파일 크기(바이트). 1 이상 15MB(15,728,640) 이하", example = "2483017",
				requiredMode = Schema.RequiredMode.REQUIRED)
		Long byteSize,

		@Schema(description = "사진 업로드 묶음 ID. 사진 묶음 기능이 생기기 전까지는 보내지 않는다",
				example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6ec0")
		UUID batchId
) {
}
