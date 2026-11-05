import { findMapRegion } from '@/lib/korea-map';

import type { MyFeed, MyPageSummary, MyTrip, MyTripPin } from './types';

/**
 * 마이페이지 요약(WD-FR-27). 서버 응답은 이 함수 한 곳에서 화면 값으로 바꾼다.
 * - 지도 핀은 다녀온(COMPLETED) 여행만. 여행지 첫 지역에 꽂는다
 * - 게시한 피드가 있으면 그 피드의 첫 지역, 없으면 여행지 첫 지역 코드(regionCodes: 지역 ID → 코드)
 * - 같은 지역 여러 여행은 하나로 묶고, 하나라도 게시했으면 게시됨
 */
export function toMyPageSummary(input: {
  nickname: string;
  profileImageUrl: string | null;
  trips: readonly MyTrip[];
  feeds: readonly MyFeed[];
  regionCodes: ReadonlyMap<string, string>;
  friendCount: number | null;
}): MyPageSummary {
  const feedByTrip = new Map(input.feeds.map((f) => [f.tripId, f]));
  const visited = input.trips.filter((t) => t.status === 'COMPLETED');

  const byRegion = new Map<string, { titles: string[]; posted: boolean; tripIds: string[] }>();
  let pinless = 0;
  for (const t of visited) {
    const feed = feedByTrip.get(t.id);
    const code =
      feed?.regions[0]?.code ??
      (t.destinationRegionIds[0] ? input.regionCodes.get(t.destinationRegionIds[0]) : undefined);
    if (!code || !findMapRegion(code)) {
      pinless += 1;
      continue;
    }
    const cur = byRegion.get(code) ?? { titles: [], posted: false, tripIds: [] };
    cur.titles.push(feed?.title ?? t.title);
    cur.posted ||= !!feed;
    cur.tripIds.push(t.id);
    byRegion.set(code, cur);
  }

  const pins: MyTripPin[] = [...byRegion.entries()].map(([regionCode, v]) => ({
    regionCode,
    label: v.titles.length === 1 ? v.titles[0] : `${v.titles[0]} 외 ${v.titles.length - 1}개`,
    posted: v.posted,
    tripIds: v.tripIds,
  }));

  return {
    nickname: input.nickname,
    profileImageUrl: input.profileImageUrl,
    visitedCount: visited.length,
    postedCount: input.feeds.length,
    tripCount: input.trips.length,
    pinlessCount: pinless,
    friendCount: input.friendCount,
    pins,
  };
}

/** 게시 전 여행 중 지도 자리를 찾으려고 코드가 필요한 지역 ID들 */
export function regionIdsToLookUp(trips: readonly MyTrip[], feeds: readonly MyFeed[]): string[] {
  const posted = new Set(feeds.map((f) => f.tripId));
  return [
    ...new Set(
      trips
        .filter((t) => t.status === 'COMPLETED' && !posted.has(t.id))
        .flatMap((t) => (t.destinationRegionIds[0] ? [t.destinationRegionIds[0]] : [])),
    ),
  ];
}

/** "다녀온 여행 4개 · 게시 1개", 없으면 "아직 기록한 여행이 없어요" */
export function profileLine(s: Pick<MyPageSummary, 'visitedCount' | 'postedCount'>): string {
  if (s.visitedCount === 0) return '아직 기록한 여행이 없어요';
  return `다녀온 여행 ${s.visitedCount}개 · 게시 ${s.postedCount}개`;
}

/** "7개 · 핀 없는 여행 1개 포함" */
export function tripListLine(s: Pick<MyPageSummary, 'tripCount' | 'pinlessCount'>): string {
  return s.pinlessCount > 0
    ? `${s.tripCount}개 · 핀 없는 여행 ${s.pinlessCount}개 포함`
    : `${s.tripCount}개`;
}
