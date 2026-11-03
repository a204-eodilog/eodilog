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

// 여행별 단일 코스. 항목·구간은 itinerary_items·route_legs에 따로 두고, 이 행은 version과 마지막 편집 정보만 가진다
// version은 전체 교체로 실제 바뀐 게 있을 때만 오른다(C-6). 여행 정보 version과는 다른 행이라 서로 409를 만들지 않는다(C-7)
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

	// 바뀐 값이 있을 때만 호출한다. 그 전에 본 화면의 요청은 409를 받는다
	public void markReplaced(UUID memberId, Instant now) {
		this.version++;
		this.updatedByMemberId = memberId;
		this.updatedAt = now;
	}

}
