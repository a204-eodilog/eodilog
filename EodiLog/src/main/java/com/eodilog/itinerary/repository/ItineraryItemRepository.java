package com.eodilog.itinerary.repository;

import com.eodilog.itinerary.domain.ItineraryItem;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ItineraryItemRepository extends JpaRepository<ItineraryItem, UUID> {

	List<ItineraryItem> findAllByItineraryIdOrderByDayAscSequenceAsc(UUID itineraryId);

}
