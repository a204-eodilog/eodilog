import { describe, expect, it } from '@jest/globals';
import {
  stayLabel,
  companionsLabel,
  dayIndex,
  dDay,
  destinationLabel,
  groupTrips,
  nextTodoLabel,
  placeNamesOfDay,
  shortRegionName,
  tripDetailView,
  tripListState,
  tripStatus,
} from './trip-rules';
import type { Trip, TripMember } from './types';

let seq = 0;
function trip(partial: Partial<Trip>): Trip {
  seq += 1;
  return {
    id: `trip-${seq}`,
    title: `여행 ${seq}`,
    startDate: null,
    endDate: null,
    destinationRegionIds: [],
    status: 'PLANNING',
    currency: 'KRW',
    ownerMemberId: 'm-1',
    members: [],
    version: 0,
    expenseVersion: 0,
    ...partial,
  };
}

function member(userId: string, nickname: string): TripMember {
  return {
    id: `m-${userId}`,
    user: {
      id: userId,
      nickname,
      profileImageUrl: null,
      accountVisibility: 'PUBLIC',
      followingStatus: 'NONE',
      followedByStatus: 'NONE',
    },
    role: 'MEMBER',
    status: 'ACTIVE',
    joinOrder: 1,
    joinedAt: '2026-11-01T00:00:00Z',
    leftAt: null,
  };
}

const TODAY = '2026-10-28';

describe('shortRegionName', () => {
  it.each([
    ['부산광역시', '부산'],
    ['서울특별시', '서울'],
    ['제주특별자치도', '제주'],
    ['세종특별자치시', '세종'],
    ['경기도', '경기'],
    ['서울특별시 종로구', '종로구'],
    ['강원특별자치도 강릉시', '강릉시'],
  ])('%s → %s', (name, short) => {
    expect(shortRegionName(name)).toBe(short);
  });
});

describe('tripStatus', () => {
  // TODAY = 2026-10-28. 기간은 10-28 ~ 10-30
  const start = '2026-10-28';
  const end = '2026-10-30';

  it.each([
    ['시작 전날', '2026-10-27', 'PLANNING'],
    ['시작일', '2026-10-28', 'ONGOING'],
    ['종료일', '2026-10-30', 'ONGOING'],
    ['종료 다음 날', '2026-10-31', 'COMPLETED'],
  ] as const)('%s(%s)는 %s', (_, today, status) => {
    expect(tripStatus(trip({ startDate: start, endDate: end }), today)).toBe(status);
  });

  it('기간이 없으면 계속 계획 중', () => {
    expect(tripStatus(trip({}), '2030-01-01')).toBe('PLANNING');
  });

  it('서버 status가 계획 중으로 남아 있어도 날짜가 지나면 여행 중', () => {
    const stale = trip({ status: 'PLANNING', startDate: TODAY, endDate: '2026-10-29' });
    expect(tripStatus(stale, TODAY)).toBe('ONGOING');
  });
});

describe('dDay / dayIndex', () => {
  it('계획 중이면 시작일까지 남은 날', () => {
    expect(dDay(trip({ startDate: '2026-11-14', endDate: '2026-11-15' }), TODAY)).toBe(17);
  });

  it('기간이 없거나 시작일이 지났으면 없다', () => {
    expect(dDay(trip({}), TODAY)).toBeNull();
    expect(dDay(trip({ startDate: TODAY, endDate: TODAY }), TODAY)).toBeNull();
  });

  it('여행 중이면 첫날이 1일차', () => {
    expect(dayIndex(trip({ startDate: '2026-10-27', endDate: '2026-10-29' }), TODAY)).toBe(2);
  });

  it('서버 status와 관계없이 날짜로 정한다', () => {
    // 응답을 받은 뒤 자정이 지나 서버 값은 PLANNING인데 오늘이 시작일
    const t = trip({ status: 'PLANNING', startDate: TODAY, endDate: '2026-10-29' });
    expect(dayIndex(t, TODAY)).toBe(1);
    expect(dDay(t, TODAY)).toBeNull();
  });
});

describe('companionsLabel', () => {
  const me = member('me', '영광');

  it('나를 빼고 두 명까지는 이름을 다 쓴다', () => {
    expect(companionsLabel([me, member('a', '세은'), member('b', '승기')], 'me')).toBe(
      '세은·승기와 함께',
    );
  });

  it('셋 이상이면 외 N명', () => {
    const others = [
      member('a', '세은'),
      member('b', '승기'),
      member('c', '인경'),
      member('d', '수철'),
    ];
    expect(companionsLabel([me, ...others], 'me')).toBe('세은·승기 외 2명과 함께');
  });

  it('혼자면 null', () => {
    expect(companionsLabel([me], 'me')).toBeNull();
  });
});

describe('destinationLabel', () => {
  it.each([
    [[], null],
    [['부산'], '부산'],
    [['부산', '강릉'], '부산·강릉'],
    [['부산', '강릉', '여수'], '부산 외 2곳'],
  ])('%j → %s', (names, label) => {
    expect(destinationLabel(names)).toBe(label);
  });
});

describe('groupTrips', () => {
  // 상태는 서버 status가 아니라 날짜로 정한다. TODAY = 2026-10-28
  it('여행 중이 다가오는 여행보다 먼저 맨 위 카드다', () => {
    const upcoming = trip({ startDate: '2026-11-01', endDate: '2026-11-02' });
    const ongoing = trip({ startDate: '2026-10-27', endDate: '2026-10-29' });

    expect(groupTrips([upcoming, ongoing], TODAY).featured).toBe(ongoing);
  });

  it('여행 중이 없으면 시작이 가장 가까운 계획 중 여행이 카드다', () => {
    const later = trip({ startDate: '2026-12-20', endDate: '2026-12-21' });
    const sooner = trip({ startDate: '2026-11-14', endDate: '2026-11-15' });
    const undated = trip({});

    const { featured, next } = groupTrips([undated, later, sooner], TODAY);
    expect(featured).toBe(sooner);
    expect(next).toEqual([later, undated]);
  });

  it('기간 있는 여행이 없으면 카드는 없고 미정 여행은 서버 순서를 지킨다', () => {
    const a = trip({});
    const b = trip({});

    expect(groupTrips([a, b], TODAY)).toEqual({ featured: null, next: [a, b], past: [] });
  });

  it('여행 중이 둘이면 하나는 다음 계획 맨 앞에 둔다', () => {
    const first = trip({ startDate: '2026-10-26', endDate: '2026-10-30' });
    const second = trip({ startDate: '2026-10-28', endDate: '2026-10-28' });
    const planned = trip({ startDate: '2026-11-01', endDate: '2026-11-01' });

    const { featured, next } = groupTrips([planned, second, first], TODAY);
    expect(featured).toBe(first);
    expect(next).toEqual([second, planned]);
  });

  it('다녀온 여행은 최근에 끝난 순', () => {
    const old = trip({ startDate: '2026-08-01', endDate: '2026-08-02' });
    const recent = trip({ startDate: '2026-10-01', endDate: '2026-10-03' });

    expect(groupTrips([old, recent], TODAY).past).toEqual([recent, old]);
  });

  it('서버 status가 계획 중이어도 오늘이 시작일이면 맨 위 여행 중 카드다', () => {
    // 어제 받은 응답을 자정 뒤에 다시 묶는 경우
    const startsToday = trip({ status: 'PLANNING', startDate: TODAY, endDate: '2026-10-29' });
    const upcoming = trip({ startDate: '2026-11-01', endDate: '2026-11-02' });

    const { featured, next } = groupTrips([upcoming, startsToday], TODAY);
    expect(featured).toBe(startsToday);
    expect(next).toEqual([upcoming]);
  });
});

describe('tripListState', () => {
  const t = trip({ startDate: '2026-11-14', endDate: '2026-11-15' });
  const last = { featured: t, next: [], past: [] };
  const base = { today: TODAY, trips: [t] };

  it('첫 로딩 중이면 loading', () => {
    expect(
      tripListState({ ...base, trips: [], complete: false, failed: false, lastSections: null }),
    ).toEqual({ kind: 'loading' });
  });

  it('다 받은 묶음 없이 연결이 끊겨 멈췄으면 offline, 묶음이 있으면 그 묶음 + stale', () => {
    expect(
      tripListState({ ...base, complete: false, failed: false, paused: true, lastSections: null }),
    ).toEqual({ kind: 'offline' });
    expect(
      tripListState({ ...base, complete: false, failed: false, paused: true, lastSections: last }),
    ).toEqual({ kind: 'ready', sections: last, stale: true });
  });

  it('1쪽은 받았지만 2쪽이 실패했고 이전 묶음이 없으면 error', () => {
    expect(tripListState({ ...base, complete: false, failed: true, lastSections: null })).toEqual({
      kind: 'error',
    });
  });

  it('이어 받다 실패했는데 이전 묶음이 있으면 이전 묶음 + stale', () => {
    expect(tripListState({ ...base, complete: false, failed: true, lastSections: last })).toEqual({
      kind: 'ready',
      sections: last,
      stale: true,
    });
  });

  it('이어 받는 중에는 일부로 묶지 않고 이전 묶음을 유지한다', () => {
    const state = tripListState({
      ...base,
      trips: [trip({ startDate: TODAY, endDate: TODAY })],
      complete: false,
      failed: false,
      lastSections: last,
    });
    expect(state).toEqual({ kind: 'ready', sections: last, stale: false });
  });

  it('끝까지 받으면 새로 묶는다', () => {
    const ongoing = trip({ startDate: TODAY, endDate: TODAY });
    const state = tripListState({
      ...base,
      trips: [t, ongoing],
      complete: true,
      failed: false,
      lastSections: last,
    });
    expect(state).toEqual({
      kind: 'ready',
      sections: { featured: ongoing, next: [t], past: [] },
      stale: false,
    });
  });

  it('다 받은 뒤 다시 불러오기만 실패하면 지금 묶음 + stale', () => {
    const state = tripListState({ ...base, complete: true, failed: true, lastSections: last });
    expect(state).toMatchObject({ kind: 'ready', stale: true });
  });
});

describe('nextTodoLabel', () => {
  it('날짜로 정한 상태와 여행지 여부에 맞춘다', () => {
    expect(nextTodoLabel(trip({}), TODAY)).toBe('장소 모으고 투표하기');
    expect(nextTodoLabel(trip({ destinationRegionIds: ['r'] }), TODAY)).toBe(
      '장소 모으고 코스 짜기',
    );
    expect(nextTodoLabel(trip({ startDate: TODAY, endDate: TODAY }), TODAY)).toBe('오늘 코스 보기');
    expect(nextTodoLabel(trip({ startDate: '2026-10-01', endDate: '2026-10-02' }), TODAY)).toBe(
      '사진 올리고 정산하기',
    );
  });
});

describe('tripDetailView', () => {
  it('여행지 미정: 장소 모으기 → 지역 투표 → 코스 짜기', () => {
    const view = tripDetailView(trip({}), [], TODAY);

    expect(view.headline).toBe('두근두근,\n어디로 떠날까요?');
    expect(view.steps.map((s) => [s.label, s.state])).toEqual([
      ['장소 모으기', 'current'],
      ['지역 투표', 'upcoming'],
      ['코스 짜기', 'upcoming'],
    ]);
    expect(view.action).toEqual({ label: '장소 모으기', target: 'favorites' });
  });

  it('여행지 정해짐: 지역 투표를 건너뛰고 D-day를 보인다', () => {
    const t = trip({ startDate: '2026-11-14', endDate: '2026-11-15', destinationRegionIds: ['r'] });
    const view = tripDetailView(t, ['부산'], TODAY);

    expect(view.headline).toBe('두근두근,\n부산 여행 D-17');
    expect(view.steps.map((s) => s.label)).toEqual(['장소 모으기', '코스 짜기', '여행 떠나기']);
    expect(view.steps[0].state).toBe('done');
    expect(view.action?.target).toBe('course');
  });

  it('여행지는 있고 기간이 없으면 D-day 없이', () => {
    const view = tripDetailView(trip({ destinationRegionIds: ['r'] }), ['부산'], TODAY);
    expect(view.headline).toBe('두근두근,\n부산 여행');
  });

  it('여행 중: n일차 + 오늘 코스 버튼', () => {
    const t = trip({ startDate: '2026-10-27', endDate: '2026-10-29' });
    const view = tripDetailView(t, ['부산'], TODAY);

    expect(view.headline).toBe('부산 여행 2일차예요');
    expect(view.steps).toEqual([]);
    expect(view.action?.target).toBe('today');
  });

  it('여행 중: 오늘 코스를 아직 모르면 줄을 비운다', () => {
    const t = trip({ startDate: '2026-10-27', endDate: '2026-10-29' });
    expect(tripDetailView(t, ['부산'], TODAY).note).toBeNull();
    expect(tripDetailView(t, ['부산'], TODAY, null).note).toBeNull();
  });

  it('여행 중: 오늘 갈 곳이 없으면 없다고 알린다', () => {
    const t = trip({ startDate: '2026-10-27', endDate: '2026-10-29' });
    expect(tripDetailView(t, ['부산'], TODAY, []).note).toBe('오늘 코스가 아직 없어요');
  });

  it('여행 중: 오늘 갈 곳을 한 줄로 알린다', () => {
    const t = trip({ startDate: '2026-10-27', endDate: '2026-10-29' });
    expect(tripDetailView(t, ['부산'], TODAY, ['해운대']).note).toBe('오늘 갈 곳: 해운대');
    expect(tripDetailView(t, ['부산'], TODAY, ['해운대', '해리단길', '광안리']).note).toBe(
      '오늘 갈 곳: 해운대 외 2곳',
    );
  });

  it('계획 중·다녀온 여행은 오늘 갈 곳을 받아도 줄이 없다', () => {
    const planning = trip({ startDate: '2026-11-14', endDate: '2026-11-15' });
    const done = trip({ startDate: '2026-10-01', endDate: '2026-10-02' });
    expect(tripDetailView(planning, ['부산'], TODAY, ['해운대']).note).toBeNull();
    expect(tripDetailView(done, ['부산'], TODAY, ['해운대']).note).toBeNull();
  });

  it('다녀옴: 사진 올리기 → 경비 정산하기 + 피드로 게시', () => {
    const t = trip({ startDate: '2026-10-01', endDate: '2026-10-02' });
    const view = tripDetailView(t, ['부산', '강릉'], TODAY);

    expect(view.headline).toBe('부산·강릉 여행, 어땠나요?');
    expect(view.steps.map((s) => [s.label, s.state])).toEqual([
      ['사진 올리기', 'current'],
      ['경비 정산하기', 'upcoming'],
    ]);
    expect(view.showPublish).toBe(true);
    expect(view.note).toBeNull();
  });

  it('여행지 2곳이면 두 이름을 이어 쓴다', () => {
    const t = trip({
      startDate: '2026-11-14',
      endDate: '2026-11-15',
      destinationRegionIds: ['a', 'b'],
    });
    expect(tripDetailView(t, ['부산', '강릉'], TODAY).headline).toBe(
      '두근두근,\n부산·강릉 여행 D-17',
    );
  });

  it('여행지 없이 여행 중이면 여행 이름을 쓴다', () => {
    const t = trip({ title: '겨울 여행', startDate: TODAY, endDate: TODAY });
    expect(tripDetailView(t, [], TODAY).headline).toBe('겨울 여행 1일차예요');
  });

  it('여행지 없이 다녀왔으면 여행 이름으로 묻는다', () => {
    const t = trip({ title: '겨울 여행', startDate: '2026-10-01', endDate: '2026-10-02' });
    expect(tripDetailView(t, [], TODAY).headline).toBe('겨울 여행, 어땠나요?');
  });

  it('서버 status가 계획 중으로 남아 있어도 오늘이 시작일이면 여행 중 화면이다', () => {
    // 어제 받은 응답을 자정 뒤에 다시 그리는 경우
    const t = trip({ status: 'PLANNING', startDate: TODAY, endDate: '2026-10-29' });
    const view = tripDetailView(t, ['부산'], TODAY);

    expect(view.headline).toBe('부산 여행 1일차예요');
    expect(view.action?.target).toBe('today');
  });
});

describe('stayLabel', () => {
  it('0박은 당일, 그 밖은 N박 N+1일이다', () => {
    expect(stayLabel(0)).toBe('당일');
    expect(stayLabel(1)).toBe('1박 2일');
    expect(stayLabel(8)).toBe('8박 9일');
  });
});

describe('placeNamesOfDay', () => {
  const item = (day: number, order: number, name: string) => ({ day, order, place: { name } });

  it('그 일차 장소만 순서대로 뽑는다', () => {
    const items = [item(2, 2, '광안리'), item(1, 1, '감천문화마을'), item(2, 1, '해운대')];
    expect(placeNamesOfDay(items, 2)).toEqual(['해운대', '광안리']);
  });

  it('그 일차에 장소가 없으면 빈 목록', () => {
    expect(placeNamesOfDay([item(1, 1, '해운대')], 3)).toEqual([]);
  });
});
