package com.eodilog.trip.dto;

import io.swagger.v3.oas.annotations.media.Schema;

// 명세 §4 POST /trips/{tripId}/leave. 1단계(정책 §11)에서는 삭제 옵션을 false만 받는다
public record LeaveTripRequest(
		@Schema(description = "내가 올린 사진도 지울지. 삭제 기능 전이라 false만 받는다(true면 400)", example = "false",
				requiredMode = Schema.RequiredMode.REQUIRED)
		Boolean deleteOwnPhotos,

		@Schema(description = "내가 보낸 채팅 메시지도 지울지. 삭제 기능 전이라 false만 받는다(true면 400)", example = "false",
				requiredMode = Schema.RequiredMode.REQUIRED)
		Boolean deleteOwnMessages,

		@Schema(description = "조회한 여행의 version. 그 사이 다른 변경이 있으면 409", example = "3",
				requiredMode = Schema.RequiredMode.REQUIRED)
		Long expectedVersion
) {
}
