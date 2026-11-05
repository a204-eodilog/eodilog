import { findMapRegion, shortRegionName, shortSidoName, sidoCodeOf } from '@/lib/korea-map';
import { colors } from '@/theme';

import type {
  DiscoveryItem,
  HomeRecommendation,
  HomeState,
  MapResult,
  RegionGroup,
  RegionMark,
} from './types';

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
      memberIds: [...v.members],
      memberNames: [],
      coverUrl: null,
      visitCount: v.visits,
      feedIds: [...v.feeds],
    }))
    .sort((a, b) => b.memberCount - a.memberCount);
}

/**
 * 전국 보기 핀 묶기(WD-FR-24). 같은 시도에 지역이 둘 이상이면 시도 하나로 묶고, 하나뿐이면 그대로 둔다.
 * 친구 수는 같은 친구를 한 번만 센다
 */
export function groupBySido(marks: readonly RegionMark[]): (RegionMark | RegionGroup)[] {
  const bySido = new Map<string, RegionMark[]>();
  for (const m of marks) {
    const sido = sidoCodeOf(m.regionCode) ?? m.regionCode;
    bySido.set(sido, [...(bySido.get(sido) ?? []), m]);
  }
  return [...bySido.entries()].map(([sidoCode, list]) => {
    if (list.length === 1) return list[0];
    const sido = findMapRegion(sidoCode);
    return {
      sidoCode,
      name: shortSidoName(sido?.name ?? sidoCode),
      placeCount: list.length,
      memberCount: new Set(list.flatMap((m) => m.memberIds)).size,
      marks: list,
    };
  });
}

export function isGroup(item: RegionMark | RegionGroup): item is RegionGroup {
  return 'sidoCode' in item;
}

const STEPS = [colors.map.step1, colors.map.step2, colors.map.step3, colors.map.step4];

/** 다녀간 친구 수 → 물드는 단계 1~4 (1명 / 2명 / 3명 / 4명 이상) */
export function markLevel(memberCount: number): number {
  return Math.min(STEPS.length, Math.max(1, memberCount));
}

/** 다녀간 친구 수에 따라 4단계 파랑 (colors.map.step1~4) */
export function markFill(memberCount: number): string {
  return STEPS[markLevel(memberCount) - 1];
}

/**
 * 차례로 물들 순서와 겹. 적게 다녀간 곳부터 물들고(Figma S05: 여수 → … → 강릉),
 * 많이 다녀간 곳일수록 옅은 파랑 위에 진한 파랑이 겹겹이 더 물든다
 */
export function fillStepsFor(marks: readonly RegionMark[]): { code: string; colors: string[] }[] {
  return [...marks]
    .sort((a, b) => a.memberCount - b.memberCount)
    .map((m) => ({ code: m.regionCode, colors: STEPS.slice(0, markLevel(m.memberCount)) }));
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
