package com.eodilog.trip.service;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.trip.domain.Trip;
import com.eodilog.trip.domain.TripMember;
import com.eodilog.trip.exception.TripErrorCode;
import com.eodilog.trip.repository.TripMemberRepository;
import com.eodilog.trip.repository.TripRepository;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

// 여행 내부 자료(상세·수정·투표·코스·채팅 등)에 들어가기 전 ACTIVE 멤버인지 확인한다(명세 §2 "멤버")
// 없는 여행·삭제된 여행·비참여·이탈은 구분하지 않고 모두 404 TRIP_NOT_FOUND로 막아 존재를 드러내지 않는다
@Component
@RequiredArgsConstructor
public class TripAccessChecker {

	private final TripRepository tripRepository;
	private final TripMemberRepository tripMemberRepository;

	@Transactional(readOnly = true)
	public TripAccess requireActiveMember(UUID tripId, UUID userId) {
		Trip trip = tripRepository.findByIdAndDeletedAtIsNull(tripId)
				.orElseThrow(() -> new BusinessException(TripErrorCode.TRIP_NOT_FOUND));
		TripMember member = tripMemberRepository.findByTripIdAndUserId(tripId, userId)
				.filter(TripMember::isActive)
				.orElseThrow(() -> new BusinessException(TripErrorCode.TRIP_NOT_FOUND));
		return new TripAccess(trip, member);
	}

	// 여행 행을 잠근 뒤 같은 기준으로 확인한다. 호출한 쓰기 트랜잭션이 끝날 때까지 잠금이 유지된다
	@Transactional(propagation = Propagation.MANDATORY)
	public TripAccess requireActiveMemberForUpdate(UUID tripId, UUID userId) {
		Trip trip = tripRepository.findActiveByIdForUpdate(tripId)
				.orElseThrow(() -> new BusinessException(TripErrorCode.TRIP_NOT_FOUND));
		TripMember member = tripMemberRepository.findByTripIdAndUserId(tripId, userId)
				.filter(TripMember::isActive)
				.orElseThrow(() -> new BusinessException(TripErrorCode.TRIP_NOT_FOUND));
		return new TripAccess(trip, member);
	}

}
