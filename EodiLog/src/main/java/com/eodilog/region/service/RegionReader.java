package com.eodilog.region.service;

import java.util.*;
import com.eodilog.region.dto.RegionView;

public interface RegionReader {
    Optional<RegionView> find(UUID regionId);
    Map<UUID, RegionView> findAll(Collection<UUID> regionIds);
}
