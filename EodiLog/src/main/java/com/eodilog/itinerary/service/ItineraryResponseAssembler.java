package com.eodilog.itinerary.service;

import com.eodilog.itinerary.domain.Itinerary;
import com.eodilog.itinerary.domain.ItineraryItem;
import com.eodilog.itinerary.domain.RouteLeg;
import com.eodilog.itinerary.dto.ItineraryItemResponse;
import com.eodilog.itinerary.dto.ItineraryPlaceResponse;
import com.eodilog.itinerary.dto.ItineraryResponse;
import com.eodilog.itinerary.dto.RouteLegResponse;
import com.eodilog.itinerary.repository.ItineraryItemRepository;
import com.eodilog.itinerary.repository.RouteLegRepository;
import com.eodilog.place.dto.PlaceView;
import com.eodilog.place.service.PlaceReader;
import jakarta.persistence.EntityManager;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

// 코스 한 개를 응답으로 만든다. 항목은 날짜·순서 순, 구간은 출발 항목의 날짜·순서 순이다. 장소 값은 PlaceReader로만 읽는다
@Component
@RequiredArgsConstructor
public class ItineraryResponseAssembler {

	private final ItineraryItemRepository itineraryItemRepository;
	private final RouteLegRepository routeLegRepository;
	private final PlaceReader placeReader;
	private final EntityManager entityManager;

	public ItineraryResponse assemble(Itinerary itinerary) {
		// 같은 트랜잭션에서 바꾼 항목·구간을 먼저 반영한다
		entityManager.flush();
		List<ItineraryItem> items = itineraryItemRepository
				.findAllByItineraryIdOrderByDayAscSequenceAsc(itinerary.getId());
		Map<UUID, PlaceView> places = items.isEmpty() ? Map.of()
				: placeReader.findAll(items.stream().map(ItineraryItem::getPlaceId).distinct().toList());
		Map<UUID, ItineraryItem> itemsById = items.stream()
				.collect(Collectors.toMap(ItineraryItem::getId, Function.identity()));

		List<ItineraryItemResponse> itemResponses = items.stream()
				.map(item -> new ItineraryItemResponse(item.getId(),
						ItineraryPlaceResponse.from(requirePlace(places, item.getPlaceId())), item.getDay(),
						item.getSequence(), item.getStartTime(), item.getStayMinutes()))
				.toList();
		List<RouteLegResponse> legResponses = routeLegRepository.findAllByItineraryId(itinerary.getId()).stream()
				.sorted(Comparator.comparingInt((RouteLeg leg) -> itemsById.get(leg.getFromItemId()).getDay())
						.thenComparingInt(leg -> itemsById.get(leg.getFromItemId()).getSequence()))
				// 경로 공급자 연동 전이라 geometry는 항상 null이다(C-5)
				.map(leg -> new RouteLegResponse(leg.getFromItemId(), leg.getToItemId(), leg.getTransportMode(),
						leg.getDurationSeconds(), leg.getDistanceMeters(), null, leg.getStatus(), leg.getQueriedAt()))
				.toList();
		return new ItineraryResponse(itinerary.getTripId(), itinerary.getVersion(), itemResponses, legResponses,
				itinerary.getUpdatedByMemberId(), itinerary.getUpdatedAt());
	}

	// places 행은 지우지 않고 항목이 FK로 참조하므로 없으면 자료 오류다
	private PlaceView requirePlace(Map<UUID, PlaceView> places, UUID placeId) {
		PlaceView place = places.get(placeId);
		if (place == null) {
			throw new IllegalStateException("코스 항목의 장소를 찾을 수 없습니다: " + placeId);
		}
		return place;
	}

}
