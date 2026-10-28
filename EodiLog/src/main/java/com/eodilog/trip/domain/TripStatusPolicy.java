package com.eodilog.trip.domain;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;

// 여행 상태는 기간으로만 정한다(명세 §9, P-2). 클라이언트가 status를 쓰지 않는다
public final class TripStatusPolicy {

	// 시작·종료 경계의 기준 시간대. Q-4가 바뀌면 이 값만 바꾼다
	public static final ZoneId SERVICE_ZONE = ZoneId.of("Asia/Seoul");

	private TripStatusPolicy() {
	}

	public static LocalDate today(Clock clock) {
		return LocalDate.now(clock.withZone(SERVICE_ZONE));
	}

	// 기간이 없으면 PLANNING, 시작일 당일부터 종료일 당일까지 ONGOING, 종료일 다음 날부터 COMPLETED
	public static TripStatus resolve(LocalDate startDate, LocalDate endDate, LocalDate today) {
		if (startDate == null || endDate == null || today.isBefore(startDate)) {
			return TripStatus.PLANNING;
		}
		if (today.isAfter(endDate)) {
			return TripStatus.COMPLETED;
		}
		return TripStatus.ONGOING;
	}

}
