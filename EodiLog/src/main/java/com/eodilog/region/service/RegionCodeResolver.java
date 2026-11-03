package com.eodilog.region.service;

import java.util.Optional;
import com.eodilog.region.dto.RegionView;

/** Converts a ten-digit legal-dong code to a selectable region; unknown codes never fall back to a province. */
public interface RegionCodeResolver {
    Optional<RegionView> resolve(String legalDongCode);
}
