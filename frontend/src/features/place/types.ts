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
};
