package com.eodilog.trip.service;

import com.eodilog.trip.domain.Trip;
import com.eodilog.trip.domain.TripMember;

// 권한 검사를 통과한 여행과 요청자의 ACTIVE 멤버십
public record TripAccess(Trip trip, TripMember member) {

	// 방장은 trips.owner_user_id와 일치하는 ACTIVE 멤버다(명세 §2). 역할은 저장하지 않고 계산한다
	public boolean isOwner() {
		return trip.getOwnerUserId().equals(member.getUserId());
	}

}
