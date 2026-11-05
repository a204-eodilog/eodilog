package com.eodilog.visit.repository;

import com.eodilog.visit.domain.Review;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReviewRepository extends JpaRepository<Review, UUID> {

	// 방문 하나당 평가는 하나다(reviews.visit_id 유일)
	Optional<Review> findByVisitId(UUID visitId);

	// 방문 목록 한 페이지의 평가를 한 번에 읽는다
	List<Review> findAllByVisitIdIn(Collection<UUID> visitIds);

	boolean existsByVisitId(UUID visitId);

}
