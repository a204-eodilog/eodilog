package com.eodilog.place.provider;

/**
 * 외부 장소 공급자. 결과 없음은 빈 페이지로, 공급자 장애는 PlaceProviderUnavailableException으로 구분한다.
 */
public interface PlaceProvider {

	/** places.provider에 저장되는 이름(예: KAKAO). */
	String name();

	ProviderPage search(ProviderSearch search);

}
