package com.eodilog.trip.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

// 명세 §4 POST /trips/{tripId}/owner-transfer
public record OwnerTransferRequest(
		@Schema(description = "새 방장의 멤버십 ID. 같은 여행의 ACTIVE 동행이어야 한다",
				example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e80", requiredMode = Schema.RequiredMode.REQUIRED)
		UUID targetMemberId,

		@Schema(description = "조회한 여행의 version. 그 사이 다른 변경이 있으면 409", example = "1",
				requiredMode = Schema.RequiredMode.REQUIRED)
		Long expectedVersion
) {
}
