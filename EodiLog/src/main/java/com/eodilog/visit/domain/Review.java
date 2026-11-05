package com.eodilog.visit.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UuidGenerator;

// 방문 한 건에 대한 평가. 작성자는 방문한 멤버(visits.member_id)이고 방문 하나당 하나다(reviews.visit_id 유일)
// 지우면 행을 물리 삭제한다. 다시 쓰면 새 평가(version 1)가 생긴다
@Entity
@Table(name = "reviews")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Review {

	@Id
	@UuidGenerator(style = UuidGenerator.Style.VERSION_7)
	private UUID id;

	private UUID visitId;

	private int score;

	private String body;

	private long version;

	private Instant createdAt;

	private Instant updatedAt;

	public static Review write(UUID visitId, int score, String body, Instant now) {
		Review review = new Review();
		review.visitId = visitId;
		review.score = score;
		review.body = body;
		review.version = 1;
		review.createdAt = now;
		review.updatedAt = now;
		return review;
	}

	// 값이 실제로 바뀌었을 때만 version과 updatedAt을 바꾼다(여행·코스와 같은 규칙). 바뀌었으면 true
	public boolean update(int score, String body, Instant now) {
		if (this.score == score && this.body.equals(body)) {
			return false;
		}
		this.score = score;
		this.body = body;
		this.version++;
		this.updatedAt = now;
		return true;
	}

}
