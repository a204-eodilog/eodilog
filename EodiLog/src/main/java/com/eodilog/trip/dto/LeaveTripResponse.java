package com.eodilog.trip.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

// 명세 §10 LeaveResult. 일반 나가기는 정리 작업이 없어 cleanupJobId null·status LEFT(200),
// 혼자 남은 사람의 나가기는 여행 삭제 접수라 tripDeleted true·status TRIP_DELETED·cleanupJobId(TRIP_DELETE 작업)이다(202, 정책 §14)
public record LeaveTripResponse(
		@Schema(description = "나간 여행 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70",
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID tripId,

		@Schema(description = "여행이 삭제됐는지. 혼자 남은 사람이 나갔을 때만 true", example = "false",
				requiredMode = Schema.RequiredMode.REQUIRED)
		boolean tripDeleted,

		@Schema(description = "방장이 나가서 새로 방장이 된 멤버십 ID. 방장이 아니었거나 여행이 삭제됐으면 null",
				example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e80", nullable = true,
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID newOwnerMemberId,

		@Schema(description = "자료 정리 작업 ID. 여행이 삭제됐을 때만 TRIP_DELETE 작업 ID, 아니면 null", nullable = true,
				requiredMode = Schema.RequiredMode.REQUIRED)
		UUID cleanupJobId,

		@Schema(description = "LEFT: 나감(여행 유지) / TRIP_DELETED: 혼자 남아 여행 삭제 접수", example = "LEFT",
				allowableValues = {"LEFT", "TRIP_DELETED"}, requiredMode = Schema.RequiredMode.REQUIRED)
		String status
) {

	public static final String STATUS_LEFT = "LEFT";
	public static final String STATUS_TRIP_DELETED = "TRIP_DELETED";

	public static LeaveTripResponse left(UUID tripId, UUID newOwnerMemberId) {
		return new LeaveTripResponse(tripId, false, newOwnerMemberId, null, STATUS_LEFT);
	}

	public static LeaveTripResponse tripDeleted(UUID tripId, UUID cleanupJobId) {
		return new LeaveTripResponse(tripId, true, null, cleanupJobId, STATUS_TRIP_DELETED);
	}

}
