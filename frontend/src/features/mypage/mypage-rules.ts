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
  followerCount: number | null;
  followingCount: number | null;
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
    followerCount: input.followerCount,
    followingCount: input.followingCount,
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

/** 핀 알약 너비 어림값(px). 한글 12 · 공백 4 · 그 밖 7, 글자는 최대 120 + 안쪽 여백 20 + 아이콘 14 + 간격 4 */
export function pinLabelWidth(label: string) {
  let w = 0;
  for (const ch of label) w += /[가-힣]/.test(ch) ? 12 : ch === ' ' ? 4 : 7;
  return Math.min(120, w) + 38;
}

export type PinLabelSpot = { dx: number; below: boolean };

type Box = { x0: number; x1: number; y0: number; y1: number };
const hit = (a: Box, b: Box, gap: number) =>
  a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.y0 < b.y1 + gap && b.y0 < a.y1 + gap;

/**
 * 핀 알약 자리 고르기. 기본은 점 바로 위, 다른 알약이나 점을 가리면 위로 옆으로 조금 · 점 아래 · 더 옆 순서로 빈 곳을 찾는다.
 * 화면 px 좌표를 받는다. 알약은 높이 28, 점과 9 떨어진다(TripPin 모양). 빈 곳이 없으면 점 바로 위에 둔다
 */
export function placePinLabels(
  items: readonly { key: string; x: number; y: number; width: number }[],
  gap = 4,
): Map<string, PinLabelSpot> {
  const dots: Box[] = items.map((i) => ({ x0: i.x - 6, x1: i.x + 6, y0: i.y - 6, y1: i.y + 6 }));
  const placed: Box[] = [];
  const out = new Map<string, PinLabelSpot>();
  // 위쪽 핀부터 자리를 잡는다
  const order = items.map((it, idx) => ({ it, idx })).sort((a, b) => a.it.y - b.it.y);
  for (const { it, idx } of order) {
    const w = it.width;
    const rectOf = (spot: PinLabelSpot): Box => {
      const x0 = it.x - w / 2 + spot.dx;
      return spot.below
        ? { x0, x1: x0 + w, y0: it.y + 9, y1: it.y + 37 }
        : { x0, x1: x0 + w, y0: it.y - 37, y1: it.y - 9 };
    };
    const tries: PinLabelSpot[] = [];
    for (const dx of [0, w / 3, -w / 3]) tries.push({ dx, below: false });
    for (const dx of [0, w / 3, -w / 3]) tries.push({ dx, below: true });
    for (const dx of [(w * 2) / 3, (-w * 2) / 3]) {
      tries.push({ dx, below: false }, { dx, below: true });
    }
    const free = tries.find((spot) => {
      const r = rectOf(spot);
      return !placed.some((p) => hit(p, r, gap)) && !dots.some((d, j) => j !== idx && hit(d, r, 0));
    });
    const spot = free ?? { dx: 0, below: false };
    placed.push(rectOf(spot));
    out.set(it.key, spot);
  }
  return out;
}
