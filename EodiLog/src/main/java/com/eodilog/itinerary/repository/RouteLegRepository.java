package com.eodilog.itinerary.repository;

import com.eodilog.itinerary.domain.RouteLeg;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RouteLegRepository extends JpaRepository<RouteLeg, UUID> {

	List<RouteLeg> findAllByItineraryId(UUID itineraryId);

	// 전체 교체 때 구간을 한 문장으로 지운다. 이미 읽어 둔 RouteLeg 엔티티는 이후 쓰지 않는다
	@Modifying
	@Query("delete from RouteLeg l where l.itineraryId = :itineraryId")
	void deleteAllByItineraryId(@Param("itineraryId") UUID itineraryId);

}
