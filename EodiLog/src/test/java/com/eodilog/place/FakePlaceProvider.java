package com.eodilog.place;

import java.util.*;
import com.eodilog.place.provider.*;

/**
 * 실제 공급자를 부르지 않는 테스트용 공급자. 등록한 장소를 이름 포함 여부로 찾고, 공급자처럼 한 페이지에 size개씩 나눈다.
 * 다른 도메인 테스트는 이 공급자의 결과를 PlaceResolver.resolve(NAME, place)로 저장해 장소 UUID를 얻는다.
 */
public class FakePlaceProvider implements PlaceProvider {

	public static final String NAME = "FAKE";

	private final List<ProviderPlace> places = new ArrayList<>();
	private final int size;
	private volatile boolean unavailable;

	public FakePlaceProvider(int size) {
		this.size = size;
	}

	public FakePlaceProvider add(ProviderPlace place) {
		places.add(place);
		return this;
	}

	public void unavailable(boolean value) {
		unavailable = value;
	}

	@Override
	public String name() {
		return NAME;
	}

	@Override
	public ProviderPage search(ProviderSearch search) {
		Objects.requireNonNull(search.query(), "query");
		if (search.page() < 1) {
			throw new IllegalArgumentException("page starts at 1");
		}
		if (unavailable) {
			throw new PlaceProviderUnavailableException(null);
		}
		var matched = places.stream().filter(p -> p.name().contains(search.query())).toList();
		int from = Math.min((search.page() - 1) * size, matched.size());
		int to = Math.min(from + size, matched.size());
		return new ProviderPage(matched.subList(from, to), to >= matched.size());
	}
}
