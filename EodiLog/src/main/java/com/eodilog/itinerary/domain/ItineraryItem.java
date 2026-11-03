package com.eodilog.itinerary.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.Objects;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UuidGenerator;

// 코스의 장소 하나. 같은 장소를 여러 번 넣을 수 있다. 날짜(day)와 그 안의 순서(sequence, API의 order)로 자리를 정한다
@Entity
@Table(name = "itinerary_items")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ItineraryItem {

	@Id
	@UuidGenerator(style = UuidGenerator.Style.VERSION_7)
	private UUID id;

	private UUID itineraryId;

	private UUID placeId;

	private int day;

	private int sequence;

	// 현지 시각 HH:mm. 생략하면 null(시간대는 Q-6)
	private String startTime;

	private Integer stayMinutes;

	public static ItineraryItem of(UUID itineraryId, UUID placeId, int day, int sequence, String startTime,
			Integer stayMinutes) {
		ItineraryItem item = new ItineraryItem();
		item.itineraryId = itineraryId;
		item.placeId = placeId;
		item.day = day;
		item.sequence = sequence;
		item.startTime = startTime;
		item.stayMinutes = stayMinutes;
		return item;
	}

	// 전체 교체에서 남는 항목은 id를 유지한 채 내용만 바꾼다(C-2)
	public void replace(UUID placeId, int day, int sequence, String startTime, Integer stayMinutes) {
		this.placeId = placeId;
		this.day = day;
		this.sequence = sequence;
		this.startTime = startTime;
		this.stayMinutes = stayMinutes;
	}

	public boolean sameAs(UUID placeId, int day, int sequence, String startTime, Integer stayMinutes) {
		return this.placeId.equals(placeId) && this.day == day && this.sequence == sequence
				&& Objects.equals(this.startTime, startTime) && Objects.equals(this.stayMinutes, stayMinutes);
	}

}
