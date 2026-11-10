package com.eodilog.timeline;

import com.eodilog.place.dto.PlaceView;
import com.eodilog.trip.domain.TripStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class TimelineDtos {

	private TimelineDtos() { }

	public enum DateBasis { TRIP, UNKNOWN }
	public enum PlaceStatus { PLANNED, VISITED }

	@Schema(description = "내 여행 타임라인 항목")
	public record TimelineItem(
			@Schema(description = "여행 ID", example = "019a0000-0000-7000-8000-000000000001", requiredMode = Schema.RequiredMode.REQUIRED) UUID tripId,
			@Schema(description = "현재 게시 피드 ID. 피드 기능 연결 전 null", nullable = true) UUID feedId,
			@Schema(description = "여행 시작일. 미정이면 null", example = "2026-11-10", nullable = true) LocalDate date,
			@Schema(description = "날짜 근거. 시작일이 없으면 UNKNOWN", example = "TRIP", requiredMode = Schema.RequiredMode.REQUIRED) DateBasis dateBasis,
			@Schema(description = "Asia/Seoul 오늘 기준 여행 상태", example = "ONGOING", requiredMode = Schema.RequiredMode.REQUIRED) TripStatus status) { }

	@Schema(description = "여행 내부 장소 타임라인. 코스 순서 뒤에 코스 밖 방문을 최초 방문 시각 순으로 제공")
	public record PlaceTimeline(
			@Schema(description = "반복 코스 항목을 포함하는 장소 목록", requiredMode = Schema.RequiredMode.REQUIRED) List<PlaceTimelineItem> items) { }

	@Schema(description = "계획 항목 또는 코스 밖 방문 장소")
	public record PlaceTimelineItem(
			@Schema(description = "장소", requiredMode = Schema.RequiredMode.REQUIRED) PlaceView place,
			@Schema(description = "여행 시작일+일차+현지 시작 시각을 Asia/Seoul에서 UTC로 변환. 날짜/시각 없으면 null", example = "2026-11-10T01:00:00Z", nullable = true) Instant plannedAt,
			@Schema(description = "같은 장소의 최초 비삭제 방문 시각. 이탈 멤버 기록 포함", example = "2026-11-10T01:10:00Z", nullable = true) Instant visitedAt,
			@Schema(description = "비삭제 방문이 있으면 VISITED", example = "VISITED", requiredMode = Schema.RequiredMode.REQUIRED) PlaceStatus status,
			@Schema(description = "장소의 비삭제 사진 수", example = "3", requiredMode = Schema.RequiredMode.REQUIRED) long photoCount,
			@Schema(description = "같은 날 다음 코스 항목까지 저장된 길찾기 거리(m). 다음 항목/유효 구간이 없으면 null", example = "1200", nullable = true) Integer plannedDistanceMeters) { }

	@Schema(description = "여행 내부 원본 기록 요약. 각 원본을 독립 집계한다")
	public record TripSummary(
			@Schema(description = "여행 ID", example = "019a0000-0000-7000-8000-000000000001", requiredMode = Schema.RequiredMode.REQUIRED) UUID tripId,
			@Schema(description = "비삭제 사진 수", example = "12", requiredMode = Schema.RequiredMode.REQUIRED) long photoCount,
			@Schema(description = "비삭제 방문의 고유 장소 수", example = "4", requiredMode = Schema.RequiredMode.REQUIRED) long visitedPlaceCount,
			@Schema(description = "방문 장소의 고유 지역 수. 지역 미지정 제외", example = "2", requiredMode = Schema.RequiredMode.REQUIRED) long visitedRegionCount,
			@Schema(description = "같은 날 인접 코스의 저장 거리 합(m). 구간 없음/필수 구간 누락/미조회면 null", example = "4200", nullable = true) Long plannedDistanceMeters,
			@Schema(description = "실제 측정 거리(m). 측정 자료가 없어 null", nullable = true) Long actualDistanceMeters,
			@Schema(description = "비삭제 경비 원금 합계. 경비가 없으면 null", example = "125000", nullable = true) Long totalAmountMinor,
			@Schema(description = "통화", example = "KRW", allowableValues = "KRW", requiredMode = Schema.RequiredMode.REQUIRED) String currency) { }
}
