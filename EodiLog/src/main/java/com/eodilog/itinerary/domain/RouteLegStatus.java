package com.eodilog.itinerary.domain;

// AVAILABLE: 경로 공급자 결과가 있음 / UNAVAILABLE: 조회 실패 또는 아직 조회 안 함(시간·거리·지도선 null)
public enum RouteLegStatus {
	AVAILABLE, UNAVAILABLE
}
