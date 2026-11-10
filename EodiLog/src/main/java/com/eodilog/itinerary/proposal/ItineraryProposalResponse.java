package com.eodilog.itinerary.proposal;

import com.eodilog.itinerary.domain.RouteLegStatus;
import com.eodilog.itinerary.domain.TransportMode;
import com.eodilog.itinerary.dto.ItineraryPlaceResponse;
import com.eodilog.itinerary.dto.RouteGeometryResponse;
import com.eodilog.job.Job;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

// 명세 §10 ItineraryProposal. 제안만 보여 준다. 코스는 apply 전까지 그대로다
@Schema(description = "AI 코스 제안 진행·결과. 적용 전까지 현재 코스는 바뀌지 않는다")
public record ItineraryProposalResponse(
		@Schema(description = "작업 상태. 실패·취소 사유는 job.error", requiredMode = Schema.RequiredMode.REQUIRED)
		Job job,

		@Schema(description = "제안을 요청할 때의 코스 version. 현재 코스 version이 이 값과 같을 때만 적용할 수 있다", example = "3",
				requiredMode = Schema.RequiredMode.REQUIRED)
		long baseVersion,

		@Schema(description = "제안 사유. 지금은 INITIAL(모은 장소로 날짜별 코스 생성)만 있다", example = "INITIAL",
				requiredMode = Schema.RequiredMode.REQUIRED)
		ProposalReason reason,

		@Schema(description = "제안한 코스 전체. 작업이 성공하기 전에는 null", nullable = true,
				requiredMode = Schema.RequiredMode.REQUIRED)
		ProposedCourse proposed,

		@Schema(description = "요청 당시 코스와 비교한 변경 요약. 작업이 성공하기 전에는 빈 목록·빈 문구",
				requiredMode = Schema.RequiredMode.REQUIRED)
		ProposalDiff diff,

		@Schema(description = "이 제안을 코스에 적용한 시각(UTC). 적용 전이면 null", example = "2026-11-09T03:00:00Z", nullable = true,
				requiredMode = Schema.RequiredMode.REQUIRED)
		Instant appliedAt,

		@Schema(description = "지금 POST /itinerary/undo로 이 적용을 되돌릴 수 있는지. 적용 뒤 코스가 바뀌었으면 false",
				example = "false", requiredMode = Schema.RequiredMode.REQUIRED)
		boolean canUndo
) {

	@Schema(description = "제안 코스. 명세 CourseContent와 같은 모양이며, 새 항목은 id가 null이라 구간을 날짜·순서로도 가리킨다")
	public record ProposedCourse(
			@Schema(description = "항목(날짜·순서 순)", requiredMode = Schema.RequiredMode.REQUIRED)
			List<ProposedItem> items,

			@Schema(description = "구간(날짜·출발 순서 순)", requiredMode = Schema.RequiredMode.REQUIRED)
			List<ProposedLeg> legs
	) {
	}

	@Schema(description = "제안 항목")
	public record ProposedItem(
			@Schema(description = "유지되는 기존 항목 ID. 새 항목이면 null(적용할 때 서버가 발급)", nullable = true,
					requiredMode = Schema.RequiredMode.REQUIRED)
			UUID id,

			@Schema(description = "장소(요청 당시 모은 장소)", requiredMode = Schema.RequiredMode.REQUIRED)
			ItineraryPlaceResponse place,

			@Schema(description = "여행 일차(1부터)", example = "1", requiredMode = Schema.RequiredMode.REQUIRED)
			int day,

			@Schema(description = "그 날짜 안의 순서(1부터)", example = "1", requiredMode = Schema.RequiredMode.REQUIRED)
			int order,

			@Schema(description = "시작 시각 HH:mm(현지). 없으면 null", example = "10:00", nullable = true,
					requiredMode = Schema.RequiredMode.REQUIRED)
			String startTime,

			@Schema(description = "머무는 시간(분). 없으면 null", example = "120", nullable = true,
					requiredMode = Schema.RequiredMode.REQUIRED)
			Integer stayMinutes
	) {
	}

	@Schema(description = "제안 구간. AI는 이동 시간만 주고 거리·지도선은 비운다")
	public record ProposedLeg(
			@Schema(description = "출발 항목 ID. 새 항목이면 null", nullable = true, requiredMode = Schema.RequiredMode.REQUIRED)
			UUID fromItemId,

			@Schema(description = "도착 항목 ID. 새 항목이면 null", nullable = true, requiredMode = Schema.RequiredMode.REQUIRED)
			UUID toItemId,

			@Schema(description = "여행 일차", example = "1", requiredMode = Schema.RequiredMode.REQUIRED)
			int day,

			@Schema(description = "출발 항목의 order", example = "1", requiredMode = Schema.RequiredMode.REQUIRED)
			int fromOrder,

			@Schema(description = "도착 항목의 order(fromOrder+1)", example = "2", requiredMode = Schema.RequiredMode.REQUIRED)
			int toOrder,

			@Schema(description = "이동 수단", example = "TRANSIT", requiredMode = Schema.RequiredMode.REQUIRED)
			TransportMode transportMode,

			@Schema(description = "예상 이동 시간(초). 경로를 못 구했으면 null", example = "1320", nullable = true,
					requiredMode = Schema.RequiredMode.REQUIRED)
			Integer durationSeconds,

			@Schema(description = "거리(m). AI 제안에서는 항상 null", nullable = true, requiredMode = Schema.RequiredMode.REQUIRED)
			Integer distanceMeters,

			@Schema(description = "지도 경로. AI 제안에서는 항상 null", nullable = true, requiredMode = Schema.RequiredMode.REQUIRED)
			RouteGeometryResponse geometry,

			@Schema(description = "AVAILABLE: 이동 시간 있음 / UNAVAILABLE: 경로를 못 구함", example = "AVAILABLE",
					requiredMode = Schema.RequiredMode.REQUIRED)
			RouteLegStatus status,

			@Schema(description = "경로를 조회한 시각(UTC)", example = "2026-11-09T03:00:00Z",
					requiredMode = Schema.RequiredMode.REQUIRED)
			Instant queriedAt
	) {
	}

	@Schema(description = "변경 요약")
	public record ProposalDiff(
			@Schema(description = "요청 당시 코스에 있었지만 제안에서 빠진 장소 ID", requiredMode = Schema.RequiredMode.REQUIRED)
			List<UUID> removedPlaceIds,

			@Schema(description = "요청 당시 코스에 없었는데 제안에 들어간 장소 ID", requiredMode = Schema.RequiredMode.REQUIRED)
			List<UUID> addedPlaceIds,

			@Schema(description = "AI가 쓴 설명. 넣지 못한 장소 수 등을 알려 준다", example = "1일차 3곳, 2일차 2곳으로 짰어요",
					requiredMode = Schema.RequiredMode.REQUIRED)
			String description
	) {

		static final ProposalDiff EMPTY = new ProposalDiff(List.of(), List.of(), "");

	}

}
