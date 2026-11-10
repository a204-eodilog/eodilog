package com.eodilog.visit.domain;

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

// 멤버 한 명의 실제 방문 한 건. 체크 해제는 deletedAt으로 남기고 되살리지 않는다(다시 체크하면 새 행)
@Entity
@Table(name = "visits")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Visit {

	@Id
	@UuidGenerator(style = UuidGenerator.Style.VERSION_7)
	private UUID id;

	private UUID tripId;

	private UUID memberId;

	private UUID placeId;

	private Instant visitedAt;

	@Enumerated(EnumType.STRING)
	private VisitEvidenceType evidenceType;

	private Instant createdAt;

	private Instant deletedAt;

	public static Visit manual(UUID tripId, UUID memberId, UUID placeId, Instant visitedAt, Instant now) {
		Visit visit = new Visit();
		visit.tripId = tripId;
		visit.memberId = memberId;
		visit.placeId = placeId;
		visit.visitedAt = visitedAt;
		visit.evidenceType = VisitEvidenceType.MANUAL;
		visit.createdAt = now;
		return visit;
	}

	// 사진 방문 후보를 본인이 확정해 만든 방문
	public static Visit photo(UUID tripId, UUID memberId, UUID placeId, Instant visitedAt, Instant now) {
		Visit visit = manual(tripId, memberId, placeId, visitedAt, now);
		visit.evidenceType = VisitEvidenceType.PHOTO;
		return visit;
	}

	public void delete(Instant now) {
		this.deletedAt = now;
	}

}
