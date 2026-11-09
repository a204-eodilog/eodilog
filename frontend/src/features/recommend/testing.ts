import type { Place } from '@/features/place/types';
import type { Region } from '@/features/trip/types';

import type { Job, RecommendationItem, RecommendationResult } from './types';

/** 테스트와 미리보기용 예시 데이터 */

export function region(id: string, name: string): Region {
  return { id, code: id, name, parentId: null, latitude: null, longitude: null };
}

export function place(id: string, name: string, address = '부산'): Place {
  return {
    id,
    name,
    address,
    latitude: 35.1,
    longitude: 129.0,
    regionId: 'region-busan',
    provider: 'KAKAO',
    providerPlaceId: id,
    source: 'PROVIDER',
  };
}

export function regionItem(
  id: string,
  name: string,
  reason = '겹친 장소가 있는 동네예요',
): RecommendationItem {
  return { type: 'REGION', region: region(id, name), place: null, reason };
}

export function placeItem(
  id: string,
  name: string,
  reason = '맛집을 고른 두 사람에게 맞아요',
  address = '부산',
): RecommendationItem {
  return { type: 'PLACE', region: null, place: place(id, name, address), reason };
}

export function job(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    kind: 'TRIP_RECOMMENDATION',
    status: 'SUCCEEDED',
    progress: 100,
    error: null,
    createdAt: '2026-11-09T05:00:00Z',
    finishedAt: '2026-11-09T05:00:08Z',
    ...overrides,
  };
}

/** Figma 201-10081과 같은 결과: 여행지 2곳, 맛집과 스팟 3곳 */
export function sampleItems(): RecommendationItem[] {
  return [
    regionItem('r-yeongdo', '영도 흰여울 일대', '겹친 장소 흰여울문화마을이 있는 동네예요'),
    regionItem('r-songjeong', '해운대 송정 일대', '겹친 장소 해운대 해변과 가까워요'),
    placeItem('p-jagalchi', '자갈치 회 골목', '맛집을 고른 두 사람에게 맞아요', '부산 중구'),
    placeItem('p-cheongsapo', '청사포 바다뷰 카페', '바다와 카페 취향이 겹쳐요', '부산 해운대구'),
    placeItem('p-igidae', '이기대 산책로', '산책과 사진 취향을 함께 반영했어요', '부산 남구'),
  ];
}

export function result(
  overrides: Partial<Job> & { insufficientData?: boolean; items?: RecommendationItem[] } = {},
): RecommendationResult {
  const { insufficientData = false, items, ...jobFields } = overrides;
  const status = jobFields.status ?? 'SUCCEEDED';
  return {
    job: job(jobFields),
    items: items ?? (status === 'SUCCEEDED' && !insufficientData ? sampleItems() : []),
    basis: insufficientData
      ? { sharedPlaceCount: 1, usedMemberCount: 1 }
      : { sharedPlaceCount: 5, usedMemberCount: 3 },
    insufficientData,
  };
}
