package com.eodilog.trip.domain;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

// 여행 이름·기간·여행지가 바뀌었다(명세 §9 TRIP_INFO_CHANGED). 수정 트랜잭션 안에서 발행한다
// 아직 받는 쪽이 없다. 알림 저장·전달은 events/outbox를 만들 때 @TransactionalEventListener로 연결한다
public record TripInfoChangedEvent(
		UUID tripId,
		// 지역 투표 확정으로 여행지가 늘어난 것처럼 서버가 바꾼 경우 null
		UUID actorUserId,
		Set<String> changedFields,
		long version,
		Instant occurredAt
) {
}
