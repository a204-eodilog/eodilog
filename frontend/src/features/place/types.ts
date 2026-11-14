/** 장소 (docs/api-spec.md Place). id는 언제나 우리 서버의 places.id다(공급자 ID 아님) */
export type Place = {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  regionId: string | null;
  provider: string | null;
  providerPlaceId: string | null;
  /** PROVIDER: 검색으로 찾은 장소 / MANUAL: 지도에서 직접 고른 장소 */
  source: 'PROVIDER' | 'MANUAL';
  /**
   * 지도 공급자의 분류 글(예: "음식점>중식"). 서버는 저장해 두지만 응답에는 아직 싣지 않는다(백엔드 요청).
   * 실리면 카드의 종류 아이콘이 이 값으로 정해진다(place-kind)
   */
  category?: string | null;
};
