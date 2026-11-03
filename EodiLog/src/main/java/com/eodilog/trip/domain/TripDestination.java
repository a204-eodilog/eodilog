package com.eodilog.trip.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

// 여행지 수정은 전체 교체다. 기존 행을 지우고 displayOrder 순서대로 다시 넣는다
@Entity
@Table(name = "trip_destinations")
@IdClass(TripDestinationId.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TripDestination {

	@Id
	private UUID tripId;

	@Id
	private UUID regionId;

	private int displayOrder;

	// 지역 투표 확정으로 추가된 여행지면 그 후보(정책 §13 V-14). 직접 고른 여행지는 null
	private UUID sourceCandidateId;

	public static TripDestination of(UUID tripId, UUID regionId, int displayOrder, UUID sourceCandidateId) {
		TripDestination destination = new TripDestination();
		destination.tripId = tripId;
		destination.regionId = regionId;
		destination.displayOrder = displayOrder;
		destination.sourceCandidateId = sourceCandidateId;
		return destination;
	}

}
