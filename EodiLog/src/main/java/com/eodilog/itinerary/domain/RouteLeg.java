package com.eodilog.itinerary.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UuidGenerator;

// 같은 날짜의 인접한 두 항목 사이 구간과 이동 수단. 경로 공급자가 정해지기 전에는 결과 없이 UNAVAILABLE로만 둔다(C-5)
// geometry_json 열은 경로 공급자 연동 때 매핑한다. 지금은 항상 null이다
@Entity
@Table(name = "route_legs")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RouteLeg {

	@Id
	@UuidGenerator(style = UuidGenerator.Style.VERSION_7)
	private UUID id;

	private UUID itineraryId;

	private UUID fromItemId;

	private UUID toItemId;

	@Enumerated(EnumType.STRING)
	private TransportMode transportMode;

	private Integer durationSeconds;

	private Integer distanceMeters;

	@Enumerated(EnumType.STRING)
	private RouteLegStatus status;

	private Instant queriedAt;

	// 경로를 조회하지 않은 구간. 0분·직선 거리로 채우지 않는다(PRD WD-FR-14)
	public static RouteLeg unavailable(UUID itineraryId, UUID fromItemId, UUID toItemId, TransportMode transportMode,
			Instant now) {
		RouteLeg leg = new RouteLeg();
		leg.itineraryId = itineraryId;
		leg.fromItemId = fromItemId;
		leg.toItemId = toItemId;
		leg.transportMode = transportMode;
		leg.status = RouteLegStatus.UNAVAILABLE;
		leg.queriedAt = now;
		return leg;
	}

	// 조회 결과가 있는 구간(AI 코스 제안 적용, 정책 I-18). AVAILABLE이면 시간은 있고 거리는 비어 있을 수 있다(I-28)
	public static RouteLeg withResult(UUID itineraryId, UUID fromItemId, UUID toItemId, TransportMode transportMode,
			Integer durationSeconds, Integer distanceMeters, RouteLegStatus status, Instant queriedAt) {
		RouteLeg leg = new RouteLeg();
		leg.itineraryId = itineraryId;
		leg.fromItemId = fromItemId;
		leg.toItemId = toItemId;
		leg.transportMode = transportMode;
		leg.durationSeconds = status == RouteLegStatus.AVAILABLE ? durationSeconds : null;
		leg.distanceMeters = status == RouteLegStatus.AVAILABLE ? distanceMeters : null;
		leg.status = status;
		leg.queriedAt = queriedAt;
		return leg;
	}

}
