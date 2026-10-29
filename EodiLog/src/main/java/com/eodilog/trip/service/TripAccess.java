package com.eodilog.trip.service;

import com.eodilog.trip.domain.Trip;
import com.eodilog.trip.domain.TripMember;

// 권한 검사를 통과한 여행과 요청자의 ACTIVE 멤버십
public record TripAccess(Trip trip, TripMember member) {
}
