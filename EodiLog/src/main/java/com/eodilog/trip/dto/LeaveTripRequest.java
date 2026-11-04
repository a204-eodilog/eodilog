package com.eodilog.trip.dto;

import io.swagger.v3.oas.annotations.media.Schema;

// 명세 §4 POST /trips/{tripId}/leave. 사진 삭제 옵션은 사진 기능 전이라 false만 받는다(정책 §11 L-3, §15)
public record LeaveTripRequest(
		@Schema(description = "내가 올린 사진도 지울지. 삭제 기능 전이라 false만 받는다(true면 400)", example = "false",
				requiredMode = Schema.RequiredMode.REQUIRED)
		Boolean deleteOwnPhotos,

		@Schema(description = "내가 보낸 채팅 메시지의 본문도 지울지. true면 LEAVE_CLEANUP 작업으로 지우고 202(지울 메시지가 없으면 200)",
				example = "false",
				requiredMode = Schema.RequiredMode.REQUIRED)
		Boolean deleteOwnMessages,

		@Schema(description = "조회한 여행의 version. 그 사이 다른 변경이 있으면 409", example = "3",
				requiredMode = Schema.RequiredMode.REQUIRED)
		Long expectedVersion
) {
}
