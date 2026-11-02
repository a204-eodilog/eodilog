package com.eodilog.trip.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

// 명세 §10 LeaveResult. 1단계(정책 §11)에서는 정리 작업이 없어 cleanupJobId는 항상 null, status는 LEFT다
public record LeaveTripResponse(
		@Schema(description = "나간 여행 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID tripId,

		@Schema(description = "여행이 삭제됐는지. 1단계에서는 항상 false", example = "false",
				requiredMode = Schema.RequiredMode.REQUIRED)
		boolean tripDeleted,

		@Schema(description = "방장이 나가서 새로 방장이 된 멤버십 ID. 방장이 아니었으면 null",
				example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e80", nullable = true,
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID newOwnerMemberId,

		@Schema(description = "자료 정리 작업 ID. 1단계에서는 정리 작업이 없어 항상 null", nullable = true,
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID cleanupJobId,

		@Schema(description = "결과 상태. 1단계에서는 항상 LEFT", example = "LEFT", allowableValues = {"LEFT", "TRIP_DELETED"},
				requiredMode = Schema.RequiredMode.REQUIRED)
		String status
) {

	public static final String STATUS_LEFT = "LEFT";

	public static LeaveTripResponse left(UUID tripId, UUID newOwnerMemberId) {
		return new LeaveTripResponse(tripId, false, newOwnerMemberId, null, STATUS_LEFT);
	}

}
