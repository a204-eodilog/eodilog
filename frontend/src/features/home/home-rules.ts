import {
  findMapRegion,
  type MapPoint,
  shortRegionName,
  shortSidoName,
  sidoCodeOf,
} from '@/lib/korea-map';
import { formatPeriodShort, formatTripNights } from '@/lib/format-date';
import { colors } from '@/theme';

import type {
  DiscoveryItem,
  FeedCard,
  HomeRecommendation,
  HomeState,
  MapResult,
  RegionGroup,
  RegionMark,
  RegionTripCard,
} from './types';

/**
 * GET /home/map 응답 → 화면용 지역 표시. 백엔드 응답이 바뀌면 이 함수만 고친다.
 * 지도 경계에 없는 코드는 뺀다. 같은 지역이 여러 번 오면 합친다.
 */
export function toRegionMarks(result: MapResult): RegionMark[] {
  const merged = new Map<
    string,
    { id: string; name: string; members: Set<string>; visits: number; feeds: Set<string> }
  >();
  for (const m of result.markers) {
    const shape = findMapRegion(m.region.code);
    if (!shape) continue;
    const cur = merged.get(m.region.code) ?? {
      id: m.region.id,
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
      regionId: v.id,
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
 * 친구가 많은 지역부터 이름을 적어 "강릉·평창", "강릉·평창 외 1곳"이 된다. pxPerUnit은 지도 좌표 1이 화면에서 몇 px인지
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
    return toGroup(`near-${codes.join('-')}`, nearLabel(c.list), c.list, [c.x, c.y]);
  });
}

/** 가까워 묶인 지역 이름. 두 곳은 "강릉·평창", 세 곳부터 "강릉·평창 외 1곳"(친구 많은 순) */
export function nearLabel(list: readonly RegionMark[]) {
  const names = list
    .slice(0, 2)
    .map((m) => m.name)
    .join('·');
  return list.length > 2 ? `${names} 외 ${list.length - 2}곳` : names;
}

export function isGroup(item: RegionMark | RegionGroup): item is RegionGroup {
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

/** GET /home/regions/{regionId}/feeds(FeedCard[]) → S06 카드. 최근 게시 먼저 */
export function toRegionTripCards(feeds: readonly FeedCard[]): RegionTripCard[] {
  return [...feeds]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .map((f) => ({
      feedId: f.id,
      title: f.title,
      period: formatPeriodShort(f.startDate, f.endDate),
      nights: nightsLabel(f.startDate, f.endDate),
      coverUrl: f.coverImageUrl ?? null,
    }));
}

/** "2박 3일", 하루면 "당일치기", 날짜가 없으면 null. 공통 formatTripNights와 같은 문구 */
export const nightsLabel = formatTripNights;

/** S05 추천 시트 설명 한 줄. 여행은 "제주 · 2박 3일"(기간이 없으면 지역만), 장소는 "강원 강릉시 명주동" */
export function recommendMetaLabel(item: Pick<HomeRecommendation, 'meta' | 'nights'>): string {
  return item.nights ? `${item.meta} · ${item.nights}` : item.meta;
}

/** 추천 응답 → 시트 줄. 사진 주소는 응답에 있을 때만 넘긴다(서버는 아직 주지 않는다) */
export function toRecommendations(items: readonly DiscoveryItem[]): HomeRecommendation[] {
  return items.flatMap((item): HomeRecommendation[] => {
    if (item.type === 'FEED' && item.feed) {
      const region = item.feed.regions[0];
      return [
        {
          id: `feed-${item.feed.id}`,
          targetId: item.feed.id,
          kind: 'trip',
          title: item.feed.title,
          meta: region ? shortRegionName(region.name) : item.reason,
          nights: nightsLabel(item.feed.startDate, item.feed.endDate),
          imageUrl: item.feed.coverImageUrl ?? null,
        },
      ];
    }
    if (item.type === 'PLACE' && item.place) {
      return [
        {
          id: `place-${item.place.id}`,
          targetId: item.place.id,
          kind: 'place',
          title: item.place.name,
          meta: item.place.address ?? item.reason,
          nights: null,
          imageUrl: item.place.imageUrl ?? null,
        },
      ];
    }
    return [];
  });
}

/**
 * 어떤 홈을 보여 줄지 (screen-list S05).
 * following: 아직 조회 중이면 undefined(기다림), 못 읽었으면 null(모름 — '친구 없음'으로 단정하지 않는다)
 */
export function homeState(input: {
  hasTrip: boolean | undefined;
  mapFailed: boolean;
  following: boolean | null | undefined;
  marks: readonly RegionMark[] | undefined;
}): HomeState {
  if (input.hasTrip === undefined) return 'loading';
  if (!input.hasTrip) return 'first-visit';
  if (input.mapFailed) return 'error';
  if (!input.marks) return 'loading';
  if (input.marks.length > 0) return 'ready';
  // 지도는 비었는데 팔로우 조회가 아직이면, 잠깐 '공개된 기록 없음'을 보였다가 '친구 없음'으로 바뀌지 않게 기다린다
  if (input.following === undefined) return 'loading';
  return input.following === false ? 'no-friends' : 'no-public';
}
