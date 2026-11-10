package com.eodilog.photo.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;

@Schema(description = "사진 일괄 변경 결과. UPDATE·MOVE·UNGROUP은 바뀐 사진을, DELETE는 삭제 승인한 사진 ID를 요청 순서대로 담는다")
public record PhotoBatchWriteResponse(
        @Schema(description = "변경 후 사진. DELETE면 빈 배열", requiredMode = Schema.RequiredMode.REQUIRED) List<PhotoResponse> photos,
        @Schema(description = "삭제 승인한 사진 ID. DELETE가 아니면 빈 배열", requiredMode = Schema.RequiredMode.REQUIRED) List<UUID> deletedPhotoIds) { }
