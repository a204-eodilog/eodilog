package com.eodilog.visit.dto;

// GET /trips/{tripId}/visits의 reviewStatus 필터. WRITTEN: 평가를 쓴 방문, UNWRITTEN: 아직 쓰지 않은 방문
public enum VisitReviewStatus {
	ALL, WRITTEN, UNWRITTEN
}
