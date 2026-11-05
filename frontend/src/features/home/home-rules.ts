import { findMapRegion, shortRegionName } from '@/lib/korea-map';
import { colors } from '@/theme';

import type { DiscoveryItem, HomeRecommendation, HomeState, MapResult, RegionMark } from './types';

/**
 * GET /home/map 응답 → 화면용 지역 표시. 백엔드 응답이 바뀌면 이 함수만 고친다.
 * 지도 경계에 없는 코드는 뺀다. 같은 지역이 여러 번 오면 합친다.
 */
export function toRegionMarks(result: MapResult): RegionMark[] {
  const merged = new Map<
    string,
    { name: string; members: Set<string>; visits: number; feeds: Set<string> }
  >();
  for (const m of result.markers) {
    const shape = findMapRegion(m.region.code);
    if (!shape) continue;
    const cur = merged.get(m.region.code) ?? {
      name: shortRegionName(m.region.name || shape.name),
      members: new Set<string>(),
      visits: 0,
      feeds: new Set<string>(),
    };
    m.visibleMemberUserIds.forEach((id) => cur.members.add(id));
    m.feedIds.forEach((id) => cur.feeds.add(id));
    cur.visits += m.visitCount;
    merged.set(m.region.code, cur);
  }
  return [...merged.entries()]
    .map(([regionCode, v]) => ({
      regionCode,
      name: v.name,
      memberCount: v.members.size,
      memberNames: [],
      coverUrl: null,
      visitCount: v.visits,
      feedIds: [...v.feeds],
    }))
    .sort((a, b) => b.memberCount - a.memberCount);
}

/** 다녀간 친구 수에 따라 4단계 파랑 (colors.map.step1~4) */
export function markFill(memberCount: number): string {
  if (memberCount >= 4) return colors.map.step4;
  if (memberCount === 3) return colors.map.step3;
  if (memberCount === 2) return colors.map.step2;
  return colors.map.step1;
}

export function fillsFor(marks: readonly RegionMark[]): Record<string, string> {
  return Object.fromEntries(marks.map((m) => [m.regionCode, markFill(m.memberCount)]));
}

/** "2박 3일", 당일이면 "당일", 날짜가 없으면 null */
export function nightsLabel(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000);
  if (!Number.isFinite(days) || days < 0) return null;
  return days === 0 ? '당일' : `${days}박 ${days + 1}일`;
}

/** 추천 응답 → 시트 줄. 표지 사진 주소는 아직 만들 수 없어 비워 둔다 */
export function toRecommendations(items: readonly DiscoveryItem[]): HomeRecommendation[] {
  return items.flatMap((item): HomeRecommendation[] => {
    if (item.type === 'FEED' && item.feed) {
      const region = item.feed.regions[0];
      return [
        {
          id: `feed-${item.feed.id}`,
          kind: 'trip',
          title: item.feed.title,
          meta: region ? shortRegionName(region.name) : item.reason,
          nights: nightsLabel(item.feed.startDate, item.feed.endDate),
          imageUrl: null,
        },
      ];
    }
    if (item.type === 'PLACE' && item.place) {
      return [
        {
          id: `place-${item.place.id}`,
          kind: 'place',
          title: item.place.name,
          meta: item.place.address ?? item.reason,
          nights: null,
          imageUrl: null,
        },
      ];
    }
    return [];
  });
}

/**
 * 어떤 홈을 보여 줄지 (screen-list S05).
 * following은 팔로우 목록을 못 읽었으면 null(모름) — 이때는 '친구 없음'으로 단정하지 않는다
 */
export function homeState(input: {
  hasTrip: boolean | undefined;
  mapFailed: boolean;
  following: boolean | null;
  marks: readonly RegionMark[] | undefined;
}): HomeState {
  if (input.hasTrip === undefined) return 'loading';
  if (!input.hasTrip) return 'first-visit';
  if (input.mapFailed) return 'error';
  if (!input.marks) return 'loading';
  if (input.marks.length > 0) return 'ready';
  return input.following === false ? 'no-friends' : 'no-public';
}
