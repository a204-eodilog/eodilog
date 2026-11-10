import type { Place } from '@/features/place/types';

import type { SavedPlace, SavedPlacePage } from './types';

export function place(id: string, name: string, overrides: Partial<Place> = {}): Place {
  return {
    id,
    name,
    address: '부산 해운대구 우동',
    latitude: 35.15,
    longitude: 129.1,
    regionId: 'region-busan',
    provider: 'KAKAO',
    providerPlaceId: id,
    source: 'PROVIDER',
    ...overrides,
  };
}

/** 그룹 즐겨찾기 한 줄. savers는 담은 멤버 ID */
export function saved(p: Place, savers: string[], memos: Record<string, string> = {}): SavedPlace {
  return {
    place: p,
    savedBy: savers.map((memberId) => ({ memberId, memo: memos[memberId] ?? null })),
    savedCount: savers.length,
  };
}

export function page(items: SavedPlace[], overrides: Partial<SavedPlacePage> = {}): SavedPlacePage {
  return {
    items,
    totals: {
      allPlaceCount: items.length,
      overlapPlaceCount: items.filter((i) => i.savedCount >= 2).length,
      filteredCount: items.length,
    },
    page: { nextCursor: null, hasNext: false },
    ...overrides,
  };
}

/** Figma 201-9344와 같은 부산 다섯 곳. m-seeun 세은, m-seung 승기, m-me 영광 */
export function sampleSaved(): SavedPlace[] {
  return [
    saved(place('p-haeundae', '해운대 해변'), ['m-seeun', 'm-seung'], {
      'm-seeun': '해 지기 전에',
    }),
    saved(place('p-gwangalli', '광안리 바다뷰 카페', { address: '부산 수영구 광안해변로 219' }), [
      'm-seeun',
    ]),
    saved(place('p-gamcheon', '감천문화마을', { address: '부산 사하구 감내2로' }), [
      'm-seung',
      'm-me',
    ]),
    saved(place('p-seomyeon', '서면 돼지국밥집', { address: '부산 부산진구 서면로' }), ['m-me']),
    saved(place('p-huinnyeoul', '흰여울문화마을', { address: '부산 영도구 영선동' }), [
      'm-seeun',
      'm-me',
    ]),
  ];
}
