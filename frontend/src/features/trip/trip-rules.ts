import { daysBetween } from '@/lib/seoul-date';

import type { Trip, TripMember, TripSections, TripStatus } from './types';

// 긴 것부터 뗀다. "제주특별자치도"가 "제주특별자치"로 남지 않게
const PROVINCE_SUFFIXES = ['특별자치도', '특별자치시', '특별시', '광역시', '도'];

/** "부산광역시" → "부산", "서울특별시 종로구" → "종로구" */
/** 기간 이름. 0박이면 "당일", 그 밖은 "1박 2일". 기간 시트 요약과 여행 목록 줄이 함께 쓴다 */
export function stayLabel(nights: number): string {
  return nights === 0 ? '당일' : `${nights}박 ${nights + 1}일`;
}

export function shortRegionName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const last = parts[parts.length - 1] ?? '';
  if (parts.length > 1) return last;
  const suffix = PROVINCE_SUFFIXES.find((s) => last.endsWith(s) && last.length > s.length);
  return suffix ? last.slice(0, -suffix.length) : last;
}

/**
 * 기간과 서울 오늘로 정하는 여행 상태. 서버(TripStatusPolicy)와 같은 규칙이다.
 * 서버 `status`는 응답 시각의 값이라 자정이 지나거나 캐시만 보일 때 틀릴 수 있어 화면에서는 이 값을 쓴다
 */
export function tripStatus(trip: Trip, today: string): TripStatus {
  const { startDate, endDate } = trip;
  if (!startDate || !endDate || today < startDate) return 'PLANNING';
  if (today > endDate) return 'COMPLETED';
  return 'ONGOING';
}

/** 시작일까지 남은 날. 여행 중·다녀옴·기간 없음이면 null */
export function dDay(trip: Trip, today: string): number | null {
  if (tripStatus(trip, today) !== 'PLANNING' || !trip.startDate) return null;
  return daysBetween(today, trip.startDate);
}

/** 여행 중이면 오늘이 몇째 날인지. 첫날이 1 */
export function dayIndex(trip: Trip, today: string): number | null {
  if (tripStatus(trip, today) !== 'ONGOING' || !trip.startDate) return null;
  return daysBetween(trip.startDate, today) + 1;
}

/** "세은·승기와 함께", 셋 이상이면 "세은·승기 외 2명과 함께", 혼자면 null */
export function companionsLabel(members: TripMember[], myUserId: string | null): string | null {
  const names = members.filter((m) => m.user.id !== myUserId).map((m) => m.user.nickname);
  if (names.length === 0) return null;
  if (names.length <= 2) return `${names.join('·')}와 함께`;
  return `${names.slice(0, 2).join('·')} 외 ${names.length - 2}명과 함께`;
}

/** 여행지 표시. 없으면 null, 두 곳까지는 "부산·강릉", 셋 이상이면 "부산 외 2곳" */
export function destinationLabel(regionNames: string[]): string | null {
  if (regionNames.length === 0) return null;
  if (regionNames.length <= 2) return regionNames.join('·');
  return `${regionNames[0]} 외 ${regionNames.length - 1}곳`;
}

function byStartAsc(a: Trip, b: Trip) {
  return (a.startDate ?? '').localeCompare(b.startDate ?? '');
}

/**
 * 여행 탭 묶음. 서버는 만든 순서로 주므로 앱이 기간을 보고 정한다.
 * - featured: 여행 중(시작이 이른 것) → 없으면 기간 있는 계획 중 중 시작이 가장 가까운 것
 * - next: 나머지 여행 중·계획 중. 시작일 순, 기간 없는 여행은 뒤(서버 순서 유지)
 * - past: 다녀온 여행. 최근에 끝난 순
 */
export function groupTrips(trips: Trip[], today: string): TripSections {
  const of = (status: TripStatus) => trips.filter((t) => tripStatus(t, today) === status);
  const ongoing = of('ONGOING').sort(byStartAsc);
  const planning = of('PLANNING');
  const dated = planning.filter((t) => t.startDate).sort(byStartAsc);
  const undated = planning.filter((t) => !t.startDate);
  const past = of('COMPLETED').sort((a, b) => (b.endDate ?? '').localeCompare(a.endDate ?? ''));

  const featured = ongoing[0] ?? dated[0] ?? null;
  const next = [...ongoing, ...dated, ...undated].filter((t) => t !== featured);
  return { featured, next, past };
}

export type TripListState =
  | { kind: 'loading' }
  /** 다 받은 묶음 없이 연결이 끊겨 받기가 멈췄다. 연결되면 자동으로 이어 받는다 */
  | { kind: 'offline' }
  | { kind: 'error' }
  /** stale: 새로 받지 못해 이전 묶음을 보이는 중. 화면에 "연결이 불안정해요" 줄을 띄운다 */
  | { kind: 'ready'; sections: TripSections; stale: boolean };

/**
 * 여행 탭 화면 상태. 서버는 만든 순서로 나눠 주므로 일부만 받은 여행으로 묶으면 맨 위 카드가 틀릴 수 있다.
 * 그래서 끝까지 받았을 때만 새로 묶고, 받는 중이거나 중간에 실패하면 마지막으로 다 받은 묶음(lastSections)을 쓴다.
 */
export function tripListState(input: {
  /** 마지막 쪽까지 받았는가 */
  complete: boolean;
  /** 마지막 요청이 실패했는가 */
  failed: boolean;
  /** 연결이 끊겨 받기가 멈췄는가(fetchStatus 'paused'). 오류로 끝나지 않아 그대로면 로딩만 돈다 */
  paused?: boolean;
  lastSections: TripSections | null;
  today: string;
  trips: Trip[];
}): TripListState {
  const { complete, failed, paused = false, lastSections, today, trips } = input;
  const stale = failed || paused;
  if (complete) return { kind: 'ready', sections: groupTrips(trips, today), stale };
  if (lastSections) return { kind: 'ready', sections: lastSections, stale };
  if (failed) return { kind: 'error' };
  return paused ? { kind: 'offline' } : { kind: 'loading' };
}

/** 여행 카드의 '지금 할 일' 한 줄 */
export function nextTodoLabel(trip: Trip, today: string): string {
  const status = tripStatus(trip, today);
  if (status === 'ONGOING') return '오늘 코스 보기';
  if (status === 'COMPLETED') return '사진 올리고 정산하기';
  return trip.destinationRegionIds.length > 0 ? '장소 모으고 코스 짜기' : '장소 모으고 투표하기';
}

export type TodoStep = {
  label: string;
  state: 'done' | 'current' | 'upcoming';
};

/** 지금 할 일 버튼이 가는 곳. 아직 없는 화면은 준비 중 안내를 띄운다 */
export type TodoTarget = 'favorites' | 'course' | 'today' | 'photos' | 'feed';

export type TripDetailView = {
  headline: string;
  steps: TodoStep[];
  action: { label: string; target: TodoTarget } | null;
  /** 단계 대신 보이는 한 줄. 여행 중의 오늘 코스 요약 자리 */
  note: string | null;
  /** 다녀온 여행의 [피드로 게시] */
  showPublish: boolean;
};

/** 여행 상세의 큰 제목과 단계. 여행지가 정해진 여행은 지역 투표를 건너뛴다(결정 F-12) */
export function tripDetailView(trip: Trip, regionNames: string[], today: string): TripDetailView {
  const place = destinationLabel(regionNames);
  // 여행지가 없으면 여행 이름을 쓴다. "겨울 여행 여행"처럼 겹치지 않게 '여행'을 붙이지 않는다
  const subject = place ? `${place} 여행` : trip.title;
  // 서버 status 대신 날짜로 정한다. 화면을 열어 둔 채 자정이 지나도 제목·단계가 맞게 바뀐다
  const status = tripStatus(trip, today);

  if (status === 'ONGOING') {
    const n = dayIndex(trip, today) ?? 1;
    return {
      headline: `${subject} ${n}일차예요`,
      steps: [],
      action: { label: '오늘 코스', target: 'today' },
      // 코스 기능(S23·S24)이 생기면 오늘 코스 요약으로 바꾼다
      note: '오늘 코스가 아직 없어요',
      showPublish: false,
    };
  }

  if (status === 'COMPLETED') {
    return {
      headline: `${subject}, 어땠나요?`,
      steps: [
        { label: '사진 올리기', state: 'current' },
        { label: '경비 정산하기', state: 'upcoming' },
      ],
      action: { label: '사진 올리기', target: 'photos' },
      note: null,
      showPublish: true,
    };
  }

  if (!place) {
    return {
      headline: '두근두근,\n어디로 떠날까요?',
      steps: [
        { label: '장소 모으기', state: 'current' },
        { label: '지역 투표', state: 'upcoming' },
        { label: '코스 짜기', state: 'upcoming' },
      ],
      action: { label: '장소 모으기', target: 'favorites' },
      note: null,
      showPublish: false,
    };
  }

  const d = dDay(trip, today);
  return {
    headline: d === null ? `두근두근,\n${place} 여행` : `두근두근,\n${place} 여행 D-${d}`,
    steps: [
      { label: '장소 모으기', state: 'done' },
      { label: '코스 짜기', state: 'current' },
      { label: '여행 떠나기', state: 'upcoming' },
    ],
    action: { label: '코스 짜기', target: 'course' },
    note: null,
    showPublish: false,
  };
}
