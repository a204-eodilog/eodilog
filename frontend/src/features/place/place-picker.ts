import { router } from 'expo-router';

import type { Place } from './types';

/**
 * 다른 화면에서 S13을 열고 고른 장소를 돌려받는 방법.
 *
 * const place = await pickPlace({ regionId });
 * if (place) save(place.id);
 *
 * - 검색에서 고르거나 지도에서 직접 고르면 그 장소, 뒤로 나가면 null
 * - S13 안에서 검색 → 지도에서 고르기로 바꿔도 같은 약속이 이어진다
 * - 한 번에 하나만 연다. 열려 있는데 또 부르면 앞의 것은 null로 끝난다
 */
export type PickPlaceOptions = {
  /** 이 지역 안에서 먼저 찾는다(GET /places regionId) */
  regionId?: string;
  /** 지도에서 고르기를 처음 열 때 가운데. 없으면 한국 전체 */
  near?: { latitude: number; longitude: number };
};

let pending: ((place: Place | null) => void) | null = null;
let handingOff = false;

export function pickPlace(options: PickPlaceOptions = {}): Promise<Place | null> {
  finishPick(null);
  return new Promise((resolve) => {
    pending = resolve;
    router.push({
      pathname: '/places/search',
      params: {
        ...(options.regionId ? { regionId: options.regionId } : {}),
        ...(options.near
          ? { lat: String(options.near.latitude), lng: String(options.near.longitude) }
          : {}),
      },
    });
  });
}

/** 고른 장소(또는 null)를 부른 화면에 돌려준다. 이미 끝났으면 아무 일도 하지 않는다 */
export function finishPick(place: Place | null) {
  const resolve = pending;
  pending = null;
  resolve?.(place);
}

/** 검색 화면이 지도에서 고르기로 넘어갈 때. 검색 화면이 닫혀도 약속을 끝내지 않는다 */
export function handOffPick() {
  handingOff = true;
}

/** 화면이 닫힐 때 부른다. 다른 S13 화면으로 넘기는 중이 아니면 null로 끝낸다 */
export function cancelPickOnLeave() {
  if (handingOff) {
    handingOff = false;
    return;
  }
  finishPick(null);
}
