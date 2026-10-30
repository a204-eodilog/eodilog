package com.eodilog.trip.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UuidGenerator;

// version은 여행 정보의 expectedVersion 비교용이다. JPA @Version을 쓰면 expense_version 변경에도 올라가 거짓 충돌이 나므로
// 서비스가 행 잠금 후 직접 비교·증가한다
@Entity
@Table(name = "trips")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Trip {

	public static final String CURRENCY_KRW = "KRW";

	@Id
	@UuidGenerator(style = UuidGenerator.Style.VERSION_7)
	private UUID id;

	private UUID ownerUserId;

	private String title;

	private LocalDate startDate;

	private LocalDate endDate;

	@Enumerated(EnumType.STRING)
	private TripStatus status;

	private String currency;

	private long version;

	private long expenseVersion;

	private Instant createdAt;

	private Instant updatedAt;

	private Instant deletedAt;

	public static Trip create(UUID ownerUserId, String title, LocalDate startDate, LocalDate endDate,
			TripStatus status, Instant now) {
		Trip trip = new Trip();
		trip.ownerUserId = ownerUserId;
		trip.title = title;
		trip.startDate = startDate;
		trip.endDate = endDate;
		trip.status = status;
		trip.currency = CURRENCY_KRW;
		trip.version = 1;
		trip.expenseVersion = 0;
		trip.createdAt = now;
		trip.updatedAt = now;
		return trip;
	}

	// 바뀐 값이 있을 때만 호출한다. 여행 정보 버전을 하나 올린다
	public void updateInfo(String title, LocalDate startDate, LocalDate endDate, TripStatus status, Instant now) {
		this.title = title;
		this.startDate = startDate;
		this.endDate = endDate;
		this.status = status;
		this.version++;
		this.updatedAt = now;
	}

	// 새 방장은 같은 여행의 ACTIVE 멤버여야 한다(서비스가 확인). 응답의 ownerMemberId·role이 바뀌므로 버전을 올린다
	public void transferOwner(UUID newOwnerUserId, Instant now) {
		this.ownerUserId = newOwnerUserId;
		this.version++;
		this.updatedAt = now;
	}

	// 멤버가 빠지면 응답의 members가 바뀌므로 버전을 올려 이전 화면 기준의 요청을 409로 막는다
	public void markMembersChanged(Instant now) {
		this.version++;
		this.updatedAt = now;
	}

	// 경비 등록·수정·삭제마다 올린다(ERD 불변식 5). 여행 정보 version과는 따로 움직여 서로 충돌을 만들지 않는다
	public void increaseExpenseVersion() {
		this.expenseVersion++;
	}

}
