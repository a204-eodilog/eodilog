import { formatPeriodShort, formatTripNights, parseDate } from '@/lib/format-date';
import { formatThousands } from '@/lib/format-number';

import type { Feed, FeedDay, FeedDetail, FeedStop, TransportKind } from './types';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;
const pad = (n: number) => String(n).padStart(2, '0');

/** "01.17" */
function monthDay(date: Date): string {
  return `${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

/** "01.17 – 01.18". 하루면 날짜 하나, 모르면 null */
export const periodLabel = formatPeriodShort;

/** "1박 2일", 하루면 "당일치기", 모르면 null. S06 카드와 같은 공통 문구 */
export const nightsLabel = formatTripNights;

/** 여행 시작일 + (일차 - 1)의 "01.17(토)". 시작일을 모르면 null */
export function dayLabel(start: string | null, day: number): string | null {
  const s = parseDate(start);
  if (!s) return null;
  const d = new Date(s.getFullYear(), s.getMonth(), s.getDate() + day - 1);
  return `${monthDay(d)}(${WEEKDAYS[d.getDay()]})`;
}

/** 경비 짧게. 180000 → "18만 원", 52000 → "5.2만 원", 9000 → "9,000원" */
export function wonShort(amount: number): string {
  if (amount < 10_000) return `${formatThousands(amount)}원`;
  const man = Math.round(amount / 1_000) / 10;
  return `${Number.isInteger(man) ? man : man.toFixed(1)}만 원`;
}

/** 서버 이동 수단 → 아이콘 종류. 모르는 값은 other */
export function transportKind(mode: string): TransportKind {
  const m = mode.toUpperCase();
  if (m === 'WALK' || m === 'WALKING') return 'walk';
  if (m === 'CAR' || m === 'TAXI' || m === 'DRIVE' || m === 'DRIVING') return 'car';
  if (m === 'TRANSIT' || m === 'BUS' || m === 'SUBWAY' || m === 'TRAIN') return 'transit';
  return 'other';
}

/** "12분", "1시간 5분". 모르면 null */
export function minutesLabel(minutes: number | null): string | null {
  if (minutes === null) return null;
  if (minutes < 60) return `${minutes}분`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

/**
 * GET /feeds/{feedId} → 화면 값. 백엔드 응답이 바뀌면 이 함수만 고친다.
 * - 장소와 이동: 공개 일정(publicItinerary)을 일차·순서대로, 번호는 일차를 넘어 이어 붙인다
 * - 평점은 그 장소 평가들의 평균(소수 한 자리), 한 줄 평가는 가장 먼저 쓴 것
 * - 장소 사진은 그 장소에 묶인 첫 사진
 */
export function toFeedDetail(feed: Feed): FeedDetail {
  const photoUrl = new Map<string, string>();
  for (const p of feed.photos)
    if (p.placeId && !photoUrl.has(p.placeId)) photoUrl.set(p.placeId, p.imageUrl);

  const reviews = new Map<string, Feed['publicReviews']>();
  for (const r of [...feed.publicReviews].sort((a, b) => a.writtenAt.localeCompare(b.writtenAt))) {
    reviews.set(r.placeId, [...(reviews.get(r.placeId) ?? []), r]);
  }

  const items = [...(feed.publicItinerary?.items ?? [])].sort(
    (a, b) => a.day - b.day || a.order - b.order,
  );
  const legs = feed.publicItinerary?.legs ?? [];
  const legFrom = new Map(legs.map((l) => [`${l.fromItemId}>${l.toItemId}`, l]));

  const days: FeedDay[] = [];
  items.forEach((item, i) => {
    const list = reviews.get(item.place.id) ?? [];
    const score = list.length
      ? Math.round((list.reduce((a, r) => a + r.score, 0) / list.length) * 10) / 10
      : null;
    const after = items[i + 1];
    const leg = after && after.day === item.day ? legFrom.get(`${item.id}>${after.id}`) : undefined;
    const stop: FeedStop = {
      itemId: item.id,
      number: i + 1,
      placeId: item.place.id,
      name: item.place.name,
      score,
      review: list[0]?.body ?? null,
      reviewAuthor: list[0]?.author.nickname ?? null,
      photoUrl: photoUrl.get(item.place.id) ?? null,
      point: { latitude: item.place.latitude, longitude: item.place.longitude },
      next: leg
        ? {
            mode: transportKind(leg.transportMode),
            minutes:
              leg.durationSeconds === null
                ? null
                : Math.max(1, Math.round(leg.durationSeconds / 60)),
          }
        : null,
    };
    const last = days[days.length - 1];
    if (last && last.day === item.day) last.stops.push(stop);
    else days.push({ day: item.day, dateLabel: dayLabel(feed.startDate, item.day), stops: [stop] });
  });

  const cover =
    feed.photos.find((p) => p.id === feed.coverPhotoId)?.imageUrl ??
    feed.photos[0]?.imageUrl ??
    null;
  return {
    id: feed.id,
    title: feed.title,
    coverUrl: cover,
    likedByMe: feed.likedByMe,
    likeCount: feed.likeCount,
    periodLabel: periodLabel(feed.startDate, feed.endDate),
    nightsLabel: nightsLabel(feed.startDate, feed.endDate),
    members: (feed.members ?? []).map((m) => ({ name: m.nickname, imageUrl: m.profileImageUrl })),
    photos: feed.photos.slice(0, 3).map((p) => ({ id: p.id, url: p.imageUrl })),
    morePhotos: Math.max(0, feed.photos.length - 3),
    days,
    expenseTotal: feed.expenseSummary?.totalAmountMinor ?? null,
  };
}

/** "승기 외 2명", 한 명이면 이름만 */
export function membersLabel(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  return names.length === 1 ? names[0] : `${names[0]} 외 ${names.length - 1}명`;
}
