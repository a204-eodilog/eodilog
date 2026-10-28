package com.eodilog.itinerary.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UuidGenerator;

// 여행별 단일 코스. 항목·구간 편집은 코스 기능에서 다루고, 여기서는 여행 생성 때의 빈 코스만 만든다
@Entity
@Table(name = "itineraries")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Itinerary {

	@Id
	@UuidGenerator(style = UuidGenerator.Style.VERSION_7)
	private UUID id;

	private UUID tripId;

	private long version;

	private UUID updatedByMemberId;

	private Instant updatedAt;

	public static Itinerary createEmpty(UUID tripId, UUID ownerMemberId, Instant now) {
		Itinerary itinerary = new Itinerary();
		itinerary.tripId = tripId;
		itinerary.version = 1;
		itinerary.updatedByMemberId = ownerMemberId;
		itinerary.updatedAt = now;
		return itinerary;
	}

}
