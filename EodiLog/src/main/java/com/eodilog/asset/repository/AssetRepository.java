package com.eodilog.asset.repository;

import com.eodilog.asset.domain.Asset;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AssetRepository extends JpaRepository<Asset, UUID> {

	// complete·취소가 동시에 와도 상태 전이는 한 번만 일어나게 행을 잠근다
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select a from Asset a where a.id = :id")
	Optional<Asset> findByIdForUpdate(@Param("id") UUID id);

}
