package com.eodilog.checklist.repository;

import com.eodilog.checklist.domain.ChecklistItem;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ChecklistItemRepository extends JpaRepository<ChecklistItem, UUID> {

	List<ChecklistItem> findAllByTripIdAndDeletedAtIsNullOrderByCreatedAtAscIdAsc(UUID tripId);

	// 지운 항목도 포함한다. 채택 후 지운 제안을 다시 채택해 되살리지 않는다(정책 S-11)
	boolean existsBySourceJobIdAndSuggestionIndex(UUID sourceJobId, Integer suggestionIndex);

	// 수정·삭제는 항목 행을 잠근 뒤 version을 비교해 동시 변경을 덮어쓰지 않는다
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select c from ChecklistItem c where c.id = :id and c.tripId = :tripId and c.deletedAt is null")
	Optional<ChecklistItem> findActiveForUpdate(@Param("tripId") UUID tripId, @Param("id") UUID id);

}
