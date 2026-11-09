import { formatPeriodShort } from '@/lib/format-date';
import { findMapRegion, shortRegionName, shortSidoName, sidoCodeOf } from '@/lib/korea-map';
import { addDays, seoulToday } from '@/lib/seoul-date';

import type { DestinationInfo, RankMove, RegionDetail, TrendBoard, TrendRegion } from './types';

/** 트렌드 기간(결정 Q-9 제안): 오늘 포함 최근 30일 */
export const TREND_DAYS = 30;

export function trendRange(today: string = seoulToday()): { from: string; to: string } {
  return { from: addDays(today, -(TREND_DAYS - 1)), to: today };
}

/** 순위 변동. 새로 들어왔으면 new, 올랐으면 up(칸 수), 내렸으면 down, 그대로·모르면 same */
export function rankMove(t: Pick<TrendRegion, 'isNew' | 'rankChange'>): RankMove {
  if (t.isNew) return { kind: 'new' };
  if (t.rankChange === null || t.rankChange === 0) return { kind: 'same' };
  return t.rankChange > 0 ? { kind: 'up', by: t.rankChange } : { kind: 'down', by: -t.rankChange };
}

/** 지역 코드 → 상위 시도 짧은 이름("강원"). 시도 자신이거나 모르면 null */
export function areaOf(code: string): string | null {
  const sido = sidoCodeOf(code);
  if (!sido || sido === code) return null;
  const r = findMapRegion(sido);
  return r ? shortSidoName(r.name) : null;
}

/** 시도 이름이 지역 이름과 같으면("제주 제주") 뺀다 */
function distinctArea(code: string, name: string): string | null {
  const area = areaOf(code);
  return area === name ? null : area;
}

/** "06:00" */
const hhmm = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** 갱신 시각 → 오늘이면 "06:00 갱신", 아니면 "11.05 06:00 갱신"(오래된 순위라는 걸 보이게) */
export function updatedLine(updatedAt: string | null, today: string = seoulToday()): string | null {
  if (!updatedAt) return null;
  const d = new Date(updatedAt);
  if (Number.isNaN(d.getTime())) return null;
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (day === today) return `${hhmm(d)} 갱신`;
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${hhmm(d)} 갱신`;
}

/** GET /trends/regions → S09 화면 값. 서버가 자료 부족을 알려 주거나 목록이 비면 순위를 보이지 않는다 */
export function toTrendBoard(
  items: readonly TrendRegion[],
  range: { from: string; to: string },
  today?: string,
): TrendBoard {
  const first = items[0];
  const from = first?.from ?? range.from;
  const to = first?.to ?? range.to;
  const period = formatPeriodShort(from, to);
  return {
    // 기간·집계 대상(왼쪽)과 갱신(오른쪽)을 한 줄 양 끝에(Q-9: 무엇을 언제까지 센 순위인지 밝힌다).
    // 11/09 직접 확인에서 아이콘 세 줄이 무겁다고 해 줄였다. 날짜 범위는 "최근 30일"로 대신한다
    basisLeft: `최근 ${TREND_DAYS}일 · 게시 여행 순`,
    basisRight: updatedLine(first?.updatedAt ?? null, today),
    period,
    insufficient: items.length === 0 || items.every((t) => t.insufficientData),
    rows: [...items]
      .sort((a, b) => a.rank - b.rank)
      .map((t) => ({
        regionId: t.region.id,
        rank: t.rank,
        name: shortRegionName(t.region.name),
        sido: distinctArea(t.region.code, shortRegionName(t.region.name)),
        tripCount: t.publishedTripCount,
        friendCount: t.followingCount,
        move: rankMove(t),
        coverUrl: null,
      })),
  };
}

/** GET /regions/{regionId} → N3 화면 값 */
export function toDestinationInfo(d: RegionDetail): DestinationInfo {
  return {
    regionId: d.region.id,
    name: shortRegionName(d.region.name),
    area: distinctArea(d.region.code, shortRegionName(d.region.name)),
    introduction: d.introduction,
    places: d.representativePlaces.map((p) => ({ id: p.id, name: p.name, address: p.address })),
    photos: [],
  };
}
