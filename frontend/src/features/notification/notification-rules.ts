import type { IconName } from '@/components/ui';

import type { NotificationView, PollBrief } from './types';

/**
 * 알림 화면 규칙. 서버 응답을 줄·묶음·이동 주소·팝업 선택으로 바꾼다. 시각은 모두 서울 기준이다.
 */

const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;
const pad2 = (n: number) => String(n).padStart(2, '0');

type KindInfo = { label: string; icon: IconName };

/** 종류 이름과 아이콘. Figma S49 줄의 작은 글씨와 원 안 아이콘 */
const KINDS: Record<string, KindInfo> = {
  POLL_OPENED: { label: '투표 시작', icon: 'check' },
  POLL_CANDIDATE_ADDED: { label: '후보 추가', icon: 'plus' },
  POLL_REMINDER: { label: '마감 전 알림', icon: 'clock' },
  POLL_FINALIZED: { label: '투표 마감', icon: 'clock' },
  POLL_CLOSED_NO_VOTES: { label: '투표 마감', icon: 'clock' },
  COURSE_CHANGED: { label: '코스 변경', icon: 'route' },
  TRIP_INFO_CHANGED: { label: '여행 정보', icon: 'trip' },
  TRIP_MEMBER_JOINED: { label: '동행 참여', icon: 'person-plus' },
  TRIP_INVITED: { label: '여행 초대', icon: 'trip' },
  FOLLOW_REQUESTED: { label: '팔로우 요청', icon: 'person-plus' },
  FOLLOW_ACCEPTED: { label: '팔로우 수락', icon: 'check' },
  AI_PROPOSAL_READY: { label: 'AI 변경안', icon: 'people' },
};

const UNKNOWN: KindInfo = { label: '알림', icon: 'bell' };

export function kindInfo(kind: string): KindInfo {
  return KINDS[kind] ?? UNKNOWN;
}

/** 앱 실행·복귀 팝업에 뜨는, 내가 해야 할 일이 있는 알림(결정 Q-14) */
export const ACTION_KINDS: ReadonlySet<string> = new Set([
  'POLL_OPENED',
  'POLL_REMINDER',
  'FOLLOW_REQUESTED',
  'TRIP_INVITED',
  'AI_PROPOSAL_READY',
]);

/** 서버 문장에서 끝의 마침표만 뗀다. 문장이 없으면 종류 이름(Q-12-3) */
export function notificationTitle(n: Pick<NotificationView, 'kind' | 'message'>): string {
  const text = (n.message ?? '').trim().replace(/\.+$/, '');
  return text || kindInfo(n.kind).label;
}

type SeoulParts = { date: string; month: number; day: number; weekday: string; clock: string };

function seoulParts(iso: string): SeoulParts {
  const d = new Date(new Date(iso).getTime() + SEOUL_OFFSET_MS);
  return {
    date: d.toISOString().slice(0, 10),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: WEEKDAYS[d.getUTCDay()],
    clock: `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`,
  };
}

const shortDate = (p: SeoulParts) => `${p.month}.${pad2(p.day)}(${p.weekday})`;

export function isToday(iso: string, now: Date): boolean {
  return seoulParts(iso).date === seoulParts(now.toISOString()).date;
}

/** S49 줄 시각. 오늘은 "20:40", 그 전은 "11.17(화)" */
export function timeLabel(iso: string, now: Date): string {
  const p = seoulParts(iso);
  return isToday(iso, now) ? p.clock : shortDate(p);
}

/** S48 팝업 줄 시각. 오늘은 "오늘 20:30" */
export function popupTimeLabel(iso: string, now: Date): string {
  const p = seoulParts(iso);
  return isToday(iso, now) ? `오늘 ${p.clock}` : shortDate(p);
}

export type NotificationLine = {
  id: string;
  title: string;
  label: string;
  icon: IconName;
  time: string;
  unread: boolean;
  /** 내 여행 목록에 없는 여행의 알림. 누르면 바로 볼 수 없음(Q-12-5) */
  leftTrip: boolean;
};

/** 알림이 가리키는 여행. 대상이 여행·코스면 대상 번호, 아니면 서버가 준 tripId */
export function tripOf(n: Pick<NotificationView, 'target' | 'tripId'>): string | null {
  if (n.target && (n.target.type === 'TRIP' || n.target.type === 'ITINERARY')) return n.target.id;
  return n.tripId ?? null;
}

/**
 * myTripIds가 null이면 내 여행 목록을 아직 모르는 것이라 '나간 여행'을 붙이지 않는다
 */
export function toLine(
  n: NotificationView,
  now: Date,
  myTripIds: ReadonlySet<string> | null,
): NotificationLine {
  const info = kindInfo(n.kind);
  const tripId = tripOf(n);
  return {
    id: n.id,
    title: notificationTitle(n),
    label: info.label,
    icon: info.icon,
    time: timeLabel(n.createdAt, now),
    unread: n.readAt === null,
    leftTrip: tripId !== null && myTripIds !== null && !myTripIds.has(tripId),
  };
}

export type Section = { title: '오늘' | '이전'; lines: NotificationLine[] };

/** 서버 순서(최신부터)를 지키며 오늘과 이전으로 나눈다. 빈 묶음은 뺀다 */
export function toSections(
  items: readonly NotificationView[],
  now: Date,
  myTripIds: ReadonlySet<string> | null,
): Section[] {
  const today: NotificationLine[] = [];
  const before: NotificationLine[] = [];
  for (const n of items) {
    (isToday(n.createdAt, now) ? today : before).push(toLine(n, now, myTripIds));
  }
  const sections: Section[] = [];
  if (today.length) sections.push({ title: '오늘', lines: today });
  if (before.length) sections.push({ title: '이전', lines: before });
  return sections;
}

/** 모두 읽음에 보낼 시각. 받은 알림 중 가장 늦게 만든 시각(Q-12-6) */
export function latestCreatedAt(items: readonly NotificationView[]): string | null {
  let latest: string | null = null;
  for (const n of items) {
    if (latest === null || new Date(n.createdAt) > new Date(latest)) latest = n.createdAt;
  }
  return latest;
}

export type Destination = {
  /** expo-router 주소. 투표·코스·변경안 화면은 다른 브랜치라 문자열로 둔다 */
  href: string;
  /** 열기 전에 받아 볼 여행. 없으면 확인 없이 간다 */
  tripId: string | null;
};

/**
 * 알림을 누르면 갈 곳. 여행 번호가 필요한데 서버가 주지 않으면 여행 탭(Q-12-1). 모르는 대상은 null
 */
export function destinationOf(n: NotificationView): Destination | null {
  const target = n.target;
  if (!target) return null;
  const tripId = n.tripId ?? null;
  switch (target.type) {
    case 'TRIP':
      return { href: `/trips/${target.id}`, tripId: target.id };
    case 'ITINERARY':
      return { href: `/trips/${target.id}/course`, tripId: target.id };
    case 'POLL':
      return tripId
        ? { href: `/trips/${tripId}/polls/${target.id}`, tripId }
        : { href: '/trips', tripId: null };
    case 'PROPOSAL':
      return tripId
        ? { href: `/trips/${tripId}/proposal?jobId=${target.id}`, tripId }
        : { href: '/trips', tripId: null };
    case 'USER':
      return n.kind === 'FOLLOW_REQUESTED'
        ? { href: '/friends', tripId: null }
        : { href: `/users/${target.id}`, tripId: null };
    // 받는 사람은 아직 동행이 아니다. 여행을 미리 받으면 404라 tripId를 두지 않는다
    case 'TRIP_INVITATION':
      return { href: `/trip-invitations/${target.id}`, tripId: null };
    default:
      return null;
  }
}

export type PopupChoice =
  { kind: 'poll'; item: NotificationView } | { kind: 'many'; items: NotificationView[] } | null;

/**
 * 팝업에 띄울 알림. 안 읽은 행동 알림 중 이번 실행에서 아직 보여 주지 않은 것만(Q-12-4).
 * 투표 시작 하나뿐이면 투표 시작 팝업
 */
export function pickPopup(
  items: readonly NotificationView[],
  shown: ReadonlySet<string>,
): PopupChoice {
  const fresh = items.filter(
    (n) => n.readAt === null && ACTION_KINDS.has(n.kind) && !shown.has(n.id),
  );
  if (fresh.length === 0) return null;
  if (fresh.length === 1 && fresh[0].kind === 'POLL_OPENED')
    return { kind: 'poll', item: fresh[0] };
  return { kind: 'many', items: fresh };
}

/** 투표 시작 팝업 제목. 투표 정보를 못 받으면 종류 없이 */
export function pollPopupTitle(brief: PollBrief | null): string {
  if (!brief) return '투표가 시작됐어요';
  return brief.type === 'REGION' ? '지역 투표가 시작됐어요' : '장소 투표가 시작됐어요';
}

/** "10.28(수) 21:00 마감" */
export function deadlineLine(closesAt: string): string {
  const p = seoulParts(closesAt);
  return `${shortDate(p)} ${p.clock} 마감`;
}
