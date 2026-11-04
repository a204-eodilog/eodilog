package com.eodilog.visit.dto;

// GET /trips/{tripId}/visits의 reviewStatus 필터. 평가 기능 전이라 WRITTEN은 늘 빈 목록, UNWRITTEN은 ALL과 같다
public enum VisitReviewStatus {
	ALL, WRITTEN, UNWRITTEN
}
