import type { Expense, SettlementState } from '@/features/expense';
import type { ItineraryItem, Visit } from '@/features/visit';
import { formatTotalShort } from '@/lib/format-number';
import { withWa } from '@/lib/korean';

import type { RecordFeed } from './components/trip-record-view';
import type { TripFeed } from './types';

/** S38 요약 카드 한 장의 값과 보조 줄. "4곳 다녀옴" / "계획 5곳" */
export type RecordSummary = { value: string; sub: string };

/** "서연, 민준과 함께". 혼자면 null */
export function companionLine(names: string): string | null {
  return names ? `${withWa(names)} 함께` : null;
}

/** 코스에 있는 장소 id. 같은 장소가 두 번 있어도 한 곳 */
function coursePlaceIds(items: ItineraryItem[]): Set<string> {
  return new Set(items.map((i) => i.place.id));
}

/** 코스 카드. 코스 장소 중 내가 다녀온 곳 수 / 계획한 곳 수. S33과 같이 코스에 없는 방문은 세지 않는다 */
export function courseSummary(items: ItineraryItem[], visits: Visit[]): RecordSummary {
  const planned = coursePlaceIds(items);
  if (planned.size === 0) return { value: '코스 없음', sub: '아직 짜지 않았어요' };
  const visited = new Set(visits.filter((v) => planned.has(v.placeId)).map((v) => v.placeId));
  return { value: `${visited.size}곳 다녀옴`, sub: `계획 ${planned.size}곳` };
}

/**
 * 평가 카드. 내가 평가한 코스 장소 수와 가장 높게 준 곳("해운대 4점").
 * 점수가 같으면 코스에서 먼저 나오는 곳
 */
export function reviewSummary(items: ItineraryItem[], visits: Visit[]): RecordSummary {
  const ordered = [...items].sort((a, b) => a.day - b.day || a.order - b.order);
  const names = new Map<string, string>();
  for (const item of ordered) {
    if (!names.has(item.place.id)) names.set(item.place.id, item.place.name);
  }
  const placeOrder = [...names.keys()];
  const mine = visits.filter((v) => names.has(v.placeId));
  const reviewed = mine
    .filter((v): v is Visit & { reviewScore: number } => v.reviewScore !== null)
    .sort(
      (a, b) =>
        b.reviewScore - a.reviewScore ||
        placeOrder.indexOf(a.placeId) - placeOrder.indexOf(b.placeId),
    );

  const value = `내 평가 ${reviewed.length}개`;
  if (reviewed.length > 0) {
    const best = reviewed[0];
    return { value, sub: `${names.get(best.placeId)} ${best.reviewScore}점` };
  }
  return { value, sub: mine.length > 0 ? '평가 전이에요' : '다녀온 곳이 없어요' };
}

/** 경비 카드. 지출 합계("23.4만 원")와 정산 상태 */
export function expenseSummary(
  expenses: Expense[],
  settlement: SettlementState | undefined,
): RecordSummary {
  if (expenses.length === 0) return { value: formatTotalShort(0), sub: '지출 없음' };
  const total = expenses.reduce((sum, e) => sum + e.amountMinor, 0);
  const value = formatTotalShort(total);
  if (!settlement?.current) return { value, sub: '정산 전' };
  if (settlement.recalculationRequired) return { value, sub: '다시 계산 필요' };
  return { value, sub: '정산 계산됨' };
}

/** 게시됨 태그 옆 줄. "전체 공개" / "전체 공개 · 하늘에게 숨김" */
export function publishedVisibility(hiddenNames: string[]): string {
  return hiddenNames.length > 0 ? `전체 공개 · ${hiddenNames.join(', ')}에게 숨김` : '전체 공개';
}

/**
 * 숨긴 친구 글자. "하늘" / "하늘 외 2명". 이름을 모르는 사람(팔로워 목록에 없거나 아직 못 읽음)만 있으면 "2명".
 * 아무도 숨기지 않았으면 null
 */
export function hiddenLabel(
  hiddenIds: readonly string[],
  nameById: ReadonlyMap<string, string>,
  /** 이름 뒤에 붙일 말("님") */
  suffix = '',
): string | null {
  if (hiddenIds.length === 0) return null;
  const first = hiddenIds.map((id) => nameById.get(id)).find((n): n is string => !!n);
  if (!first) return `${hiddenIds.length}명`;
  return hiddenIds.length === 1
    ? `${first}${suffix}`
    : `${first}${suffix} 외 ${hiddenIds.length - 1}명`;
}

/**
 * S38 공동 피드 상태. 게시 전(null)이면 draft.
 * 게시됨이면 "전체 공개 · 하늘에게 숨김"과, 숨긴 친구가 있고 다른 동행이 있으면
 * "하늘님은 서연님 피드에서는 볼 수 있어요"(동행이 여럿이면 "다른 동행 피드")
 */
export function recordFeed(
  feed: TripFeed | null | undefined,
  nameById: ReadonlyMap<string, string>,
  otherCompanions: readonly string[],
): RecordFeed {
  if (!feed) return { status: 'draft' };
  const hidden = feed.visibility.hiddenViewerUserIds;
  const label = hiddenLabel(hidden, nameById);
  const who = hiddenLabel(hidden, nameById, '님');
  const where =
    otherCompanions.length === 0
      ? null
      : otherCompanions.length === 1
        ? `${otherCompanions[0]}님 피드`
        : '다른 동행 피드';
  return {
    status: 'published',
    visibility: publishedVisibility(label ? [label] : []),
    hiddenNote: who && where ? `${who}은 ${where}에서는 볼 수 있어요` : null,
  };
}
