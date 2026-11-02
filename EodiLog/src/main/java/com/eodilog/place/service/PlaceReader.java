package com.eodilog.place.service;

import java.util.*;
import com.eodilog.place.dto.PlaceView;

public interface PlaceReader {

	Optional<PlaceView> find(UUID placeId);

	// 존재하는 장소만 반환한다. 없는 ID를 404/422 중 무엇으로 거부할지는 호출하는 기능이 정한다
	Map<UUID, PlaceView> findAll(Collection<UUID> placeIds);

}
