/** 장소 (docs/api-spec.md Place). 서버가 공급자 결과를 로컬에 저장한 뒤 로컬 UUID만 준다 */
export type Place = {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  regionId: string | null;
  provider: string | null;
  providerPlaceId: string | null;
  source: 'PROVIDER' | 'MANUAL';
};

/**
 * 개인 즐겨찾기 (docs/api-spec.md Bookmark).
 * 원본 공동 피드가 지워졌거나 볼 수 없게 되면 place·sourceFeedId가 null이고 이름·위치(retainedPlace)와 내 메모만 남는다.
 * 썸네일·출처 종류(SNS·블로그·캡처)·키워드는 응답에 없다
 */
export type Bookmark = {
  place: Place | null;
  retainedPlace: { name: string; latitude: number; longitude: number };
  memo: string | null;
  sourceFeedId: string | null;
  sourceUnavailable: boolean;
  createdAt: string;
};
