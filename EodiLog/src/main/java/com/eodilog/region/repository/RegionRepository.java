package com.eodilog.region.repository;

import com.eodilog.region.domain.Region;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RegionRepository extends JpaRepository<Region, UUID> {
}
