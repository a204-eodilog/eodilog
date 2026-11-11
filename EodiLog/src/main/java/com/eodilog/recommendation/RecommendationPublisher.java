package com.eodilog.recommendation;

import com.eodilog.place.dto.PlaceView;
import com.eodilog.place.service.PlaceReader;
import com.eodilog.region.dto.RegionView;
import com.eodilog.region.service.RegionReader;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

// 저장한 추천(ID)을 공개 Place·Region으로 바꾼다. GET 추천과 GET /jobs가 같은 모양을 쓴다. 없어진 장소·지역은 뺀다
@Component
@RequiredArgsConstructor
class RecommendationPublisher {

	private final PlaceReader placeReader;
	private final RegionReader regionReader;

	List<TripRecommendationResponse.Item> items(StoredRecommendation stored) {
		var placeIds = stored.ids(StoredRecommendation.Type.PLACE);
		var regionIds = stored.ids(StoredRecommendation.Type.REGION);
		Map<java.util.UUID, PlaceView> places = placeIds.isEmpty() ? Map.of() : placeReader.findAll(placeIds);
		Map<java.util.UUID, RegionView> regions = regionIds.isEmpty() ? Map.of() : regionReader.findAll(regionIds);
		List<TripRecommendationResponse.Item> items = new ArrayList<>();
		for (StoredRecommendation.Item item : stored.items()) {
			if (item.type() == StoredRecommendation.Type.PLACE && places.containsKey(item.id())) {
				items.add(new TripRecommendationResponse.Item("PLACE", null, places.get(item.id()), item.reason()));
			} else if (item.type() == StoredRecommendation.Type.REGION && regions.containsKey(item.id())) {
				items.add(new TripRecommendationResponse.Item("REGION", regions.get(item.id()), null, item.reason()));
			}
		}
		return items;
	}

	TripRecommendationResponse.Basis basis(StoredRecommendation stored) {
		return new TripRecommendationResponse.Basis(stored.sharedPlaceCount(), stored.usedMemberCount());
	}

}
