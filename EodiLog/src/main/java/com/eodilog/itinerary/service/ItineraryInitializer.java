package com.eodilog.itinerary.service;

import com.eodilog.itinerary.domain.Itinerary;
import com.eodilog.itinerary.repository.ItineraryRepository;
import java.time.Instant;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

// 여행 생성 트랜잭션 안에서만 호출한다. 실패하면 여행 생성 전체가 롤백된다
@Service
@RequiredArgsConstructor
public class ItineraryInitializer {

	private final ItineraryRepository itineraryRepository;

	@Transactional(propagation = Propagation.MANDATORY)
	public Itinerary createEmpty(UUID tripId, UUID ownerMemberId, Instant now) {
		return itineraryRepository.save(Itinerary.createEmpty(tripId, ownerMemberId, now));
	}

}
