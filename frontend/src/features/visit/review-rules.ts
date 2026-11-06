import { apiErrorCode } from '@/api/errors';
import { formatDay, seoulToday } from '@/lib/seoul-date';

import type { ItineraryItem, Review, Visit } from './types';
import { dayTitle } from './visit-rules';

/** 서버 규칙: 평가 글은 공백만은 안 되고 1,000자(코드 포인트)까지 */
export const REVIEW_BODY_MAX = 1000;

/** 글자 수. 이모지처럼 두 칸짜리 글자도 하나로 센다(서버와 같은 코드 포인트 기준) */
export function bodyLength(body: string): number {
  return [...body].length;
}

/** 점수(1~5)를 골랐고 글이 비어 있지 않으며 1,000자 이하일 때만 저장할 수 있다 */
export function canSaveReview(score: number | null, body: string): boolean {
  return (
    score !== null &&
    score >= 1 &&
    score <= 5 &&
    body.trim().length > 0 &&
    bodyLength(body) <= REVIEW_BODY_MAX
  );
}

/** ISO 시각 → 서울 날짜 "11.15(일)" */
export function seoulDayLabel(iso: string): string {
  return formatDay(seoulToday(new Date(iso)));
}

/**
 * 장소 줄 아래 날짜. 코스에 있으면 "1일차 · 11.14(토) 10:00"(같은 장소가 두 번이면 먼저 나오는 것),
 * 코스에 없으면 다녀온 날(서울) "11.14(토)"
 */
export function visitWhen(visit: Visit, items: ItineraryItem[], startDate: string | null): string {
  const item = [...items]
    .filter((i) => i.place.id === visit.placeId)
    .sort((a, b) => a.day - b.day || a.order - b.order)[0];
  if (!item) return seoulDayLabel(visit.visitedAt);
  const title = dayTitle(item.day, startDate);
  return item.startTime ? `${title} ${item.startTime}` : title;
}

/** 장소 이름. 코스 → 평가 요약 순으로 찾고, 둘 다 없으면 "장소" */
export function placeNameOf(visit: Visit, items: ItineraryItem[], reviews: Review[]): string {
  return (
    items.find((i) => i.place.id === visit.placeId)?.place.name ??
    reviews.find((r) => r.visit.placeId === visit.placeId && r.place)?.place?.name ??
    '장소'
  );
}

/** 이 방문에 내가 남긴 평가. 없으면 null */
export function myReviewOf(visit: Visit, reviews: Review[]): Review | null {
  return reviews.find((r) => r.visitId === visit.id) ?? null;
}

/** 같은 장소에 동행이 남긴 평가. 먼저 쓴 순(값 문서 예시 서연 11.15 → 민준 11.16) */
export function companionReviewsOf(visit: Visit, reviews: Review[]): Review[] {
  return reviews
    .filter((r) => r.visit.placeId === visit.placeId && r.authorMemberId !== visit.memberId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * 저장·삭제 실패 나누기. conflict: 그 사이 다른 곳에서 평가가 바뀜(다시 읽고 확인),
 * gone: 방문이 해제됐거나 평가가 이미 없음(다시 읽기), error: 그 밖(같은 내용으로 다시 시도)
 */
export function reviewFailure(error: unknown): 'conflict' | 'gone' | 'error' {
  const code = apiErrorCode(error);
  if (code === 'VERSION_CONFLICT') return 'conflict';
  if (code === 'VISIT_NOT_FOUND' || code === 'REVIEW_NOT_FOUND') return 'gone';
  return 'error';
}
