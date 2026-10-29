package com.eodilog.trip.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

// 명세 §4 GET /trips/{tripId}/members
public record TripMembersResponse(
		@Schema(description = "멤버 목록(참여 순). includeInactive=true면 나간·내보낸 멤버도 포함",
				requiredMode = Schema.RequiredMode.REQUIRED)
		List<TripMemberResponse> members
) {
}
