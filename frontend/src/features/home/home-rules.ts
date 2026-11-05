import {
  findMapRegion,
  type MapPoint,
  shortRegionName,
  shortSidoName,
  sidoCodeOf,
} from '@/lib/korea-map';
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

const pointOf = (m: RegionMark): MapPoint | undefined => findMapRegion(m.regionCode)?.point;

/** 묶인 지역들의 가운데. 도 전체 가운데가 아니라 실제로 다녀간 곳 쪽에 핀이 꽂힌다 */
function centerOf(list: readonly RegionMark[]): MapPoint {
  const pts = list.flatMap((m) => {
    const p = pointOf(m);
    return p ? [p] : [];
  });
  const sum = pts.reduce<MapPoint>((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]);
  return [sum[0] / pts.length, sum[1] / pts.length];
}

function toGroup(key: string, label: string, list: RegionMark[], point?: MapPoint): RegionGroup {
  return {
    key,
    label,
    placeCount: list.length,
    memberCount: new Set(list.flatMap((m) => m.memberIds)).size,
    point: point ?? centerOf(list),
    marks: list,
  };
}

/**
 * 전국 보기(1단계) 핀 묶기(WD-FR-24). 같은 시도에 지역이 둘 이상이면 시도 하나로 묶고, 하나뿐이면 그대로 둔다.
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
    const name = shortSidoName(findMapRegion(sidoCode)?.name ?? sidoCode);
    return toGroup(`sido-${sidoCode}`, `${name} ${list.length}곳`, list);
  });
}

/**
 * 확대 단계(2~5단계) 핀 묶기. 그 단계 배율에서 핀끼리 화면에서 겹치면(room 안) 하나로 묶는다.
 * 친구가 많은 지역이 대표가 되어 "강릉 외 2곳"이 된다. pxPerUnit은 지도 좌표 1이 화면에서 몇 px인지
 */
export function clusterMarks(
  marks: readonly RegionMark[],
  pxPerUnit: number,
  room: { width: number; height: number },
): (RegionMark | RegionGroup)[] {
  // 겹침은 대표 지역(친구가 가장 많은 곳) 자리로 판단한다. 가운데로 재면 묶음이 점점 넓어진다
  const clusters: { list: RegionMark[]; at: MapPoint; x: number; y: number }[] = [];
  const sorted = [...marks].sort((a, b) => b.memberCount - a.memberCount);
  for (const m of sorted) {
    const p = pointOf(m);
    if (!p) continue;
    const hit = clusters.find(
      (c) =>
        Math.abs(c.at[0] - p[0]) * pxPerUnit < room.width &&
        Math.abs(c.at[1] - p[1]) * pxPerUnit < room.height,
    );
    if (!hit) {
      clusters.push({ list: [m], at: p, x: p[0], y: p[1] });
      continue;
    }
    hit.list.push(m);
    hit.x += (p[0] - hit.x) / hit.list.length;
    hit.y += (p[1] - hit.y) / hit.list.length;
  }
  return clusters.map((c) => {
    if (c.list.length === 1) return c.list[0];
    const codes = c.list.map((m) => m.regionCode).sort();
    return toGroup(
      `near-${codes.join('-')}`,
      `${c.list[0].name} 외 ${c.list.length - 1}곳`,
      c.list,
      [c.x, c.y],
    );
  });
}

type Rect = { x0: number; y0: number; x1: number; y1: number };
const overlaps = (a: Rect, b: Rect, gap: number) =>
  a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.y0 < b.y1 + gap && b.y0 < a.y1 + gap;

export type PlacedPhoto = { mark: RegionMark; side: 'left' | 'right' };

/**
 * 사진 카드 단계(4~5단계) 핀 놓기. 카드는 점 옆으로 뻗어 나가므로 점 사이 거리가 아니라
 * 카드 네모가 실제로 겹치는지 본다. 친구가 많은 지역부터 오른쪽 → 왼쪽 순으로 빈 자리를 찾고,
 * 양쪽 다 겹치면 가장 가까운 카드와 묶는다("강릉 외 1곳"). 좌표는 화면 px 기준(pxPerUnit)
 */
export function placePhotoPins(
  marks: readonly RegionMark[],
  pxPerUnit: number,
  card: { width: number; height: number; gap: number },
  /** 묶이면 카드 대신 점 위에 알약이 놓인다. 그 자리까지 미리 잡아 두어 다른 카드가 올라타지 않게 한다 */
  pill = { width: 120, height: 48 },
): (PlacedPhoto | RegionGroup)[] {
  const placed: { rect: Rect; x: number; y: number; list: RegionMark[]; side: 'left' | 'right' }[] =
    [];
  const sorted = [...marks].sort((a, b) => b.memberCount - a.memberCount);
  for (const m of sorted) {
    const p = pointOf(m);
    if (!p) continue;
    const x = p[0] * pxPerUnit;
    const y = p[1] * pxPerUnit;
    const rectOf = (side: 'left' | 'right'): Rect => ({
      x0: Math.min(side === 'right' ? x : x - card.width, x - pill.width / 2),
      x1: Math.max(side === 'right' ? x + card.width : x, x + pill.width / 2),
      y0: y - Math.max(card.height / 2, pill.height),
      y1: y + card.height / 2,
    });
    const free = (['right', 'left'] as const).find((side) => {
      const rect = rectOf(side);
      return !placed.some((q) => overlaps(q.rect, rect, card.gap));
    });
    if (free) {
      placed.push({ rect: rectOf(free), x, y, list: [m], side: free });
      continue;
    }
    const near = placed.reduce((a, q) =>
      Math.hypot(q.x - x, q.y - y) < Math.hypot(a.x - x, a.y - y) ? q : a,
    );
    near.list.push(m);
  }
  return placed.map((c) => {
    if (c.list.length === 1) return { mark: c.list[0], side: c.side };
    const codes = c.list.map((m) => m.regionCode).sort();
    return toGroup(
      `near-${codes.join('-')}`,
      `${c.list[0].name} 외 ${c.list.length - 1}곳`,
      c.list,
      pointOf(c.list[0]),
    );
  });
}

export function isGroup(item: RegionMark | RegionGroup | PlacedPhoto): item is RegionGroup {
  return 'marks' in item;
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
