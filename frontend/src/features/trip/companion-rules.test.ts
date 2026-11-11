import { describe, expect, it } from '@jest/globals';
import { AxiosError, AxiosHeaders } from 'axios';

import {
  buildTripUpdate,
  canInvite,
  isAlone,
  memberActionFailure,
  memberLabel,
  mergeAfterConflict,
  myMember,
  nextOwner,
  pickableMembers,
  settingsActions,
  tripRole,
} from './companion-rules';
import type { Trip, TripMember } from './types';

function member(id: string, userId: string, joinOrder: number): TripMember {
  return {
    id,
    user: {
      id: userId,
      nickname: userId,
      profileImageUrl: null,
      accountVisibility: 'PUBLIC',
      followingStatus: 'NONE',
      followedByStatus: 'NONE',
    },
    role: 'MEMBER',
    status: 'ACTIVE',
    joinOrder,
    joinedAt: '2026-11-01T00:00:00Z',
    leftAt: null,
  };
}

function trip(members: TripMember[], ownerMemberId: string): Trip {
  return {
    id: 't1',
    title: '겨울 여행',
    startDate: null,
    endDate: null,
    destinationRegionIds: [],
    status: 'PLANNING',
    currency: 'KRW',
    ownerMemberId,
    members,
    version: 3,
    expenseVersion: 0,
  };
}

const A = member('m-a', 'u-a', 1);
const B = member('m-b', 'u-b', 2);
const C = member('m-c', 'u-c', 3);

function apiError(status: number | null, code?: string) {
  const config = { headers: new AxiosHeaders() };
  if (status === null) return new AxiosError('Network Error', 'ERR_NETWORK', config);
  return new AxiosError('fail', undefined, config, undefined, {
    status,
    statusText: '',
    headers: {},
    config,
    data: code ? { error: { code, message: '' } } : {},
  });
}

describe('방장 여부와 메뉴', () => {
  const t = trip([A, B, C], 'm-a');

  it('ownerMemberId가 내 멤버 id면 방장, 아니면 동행이다', () => {
    expect(tripRole(t, 'u-a')).toBe('owner');
    expect(tripRole(t, 'u-b')).toBe('member');
  });

  it('여행 멤버에 내가 없으면 역할도 메뉴도 없다', () => {
    expect(myMember(t, 'u-x')).toBeNull();
    expect(tripRole(t, 'u-x')).toBeNull();
    expect(tripRole(t, null)).toBeNull();
    expect(settingsActions(null, 3)).toEqual([]);
  });

  it('방장은 넘기기·내보내기·나가기·삭제 4줄이다', () => {
    expect(settingsActions('owner', 3).map((a) => a.key)).toEqual([
      'handover',
      'kick',
      'leave',
      'delete',
    ]);
    expect(settingsActions('owner', 3).find((a) => a.key === 'delete')?.danger).toBe(true);
  });

  it('동행은 나가기 1줄만 있고 방장 줄은 자리도 없다', () => {
    const actions = settingsActions('member', 3);
    expect(actions.map((a) => a.key)).toEqual(['leave']);
  });

  it('방장이 혼자면 넘기기·내보내기를 누를 수 없고 이유가 붙는다', () => {
    const actions = settingsActions('owner', 1);
    expect(actions.find((a) => a.key === 'handover')).toMatchObject({
      disabled: true,
      reason: '넘길 동행이 없어요',
    });
    expect(actions.find((a) => a.key === 'kick')).toMatchObject({
      disabled: true,
      reason: '내보낼 동행이 없어요',
    });
    expect(actions.find((a) => a.key === 'leave')?.disabled).toBeUndefined();
  });

  it('방장·나 표시를 붙인다. 방장이 나면 둘 다다', () => {
    expect(memberLabel(A, t, 'u-a')).toEqual(['방장', '나']);
    expect(memberLabel(A, t, 'u-b')).toEqual(['방장']);
    expect(memberLabel(B, t, 'u-b')).toEqual(['나']);
    expect(memberLabel(C, t, 'u-b')).toEqual([]);
  });
});

describe('이어받을 사람', () => {
  it('나를 뺀 사람 중 가장 먼저 참여한 사람이다', () => {
    expect(nextOwner(trip([A, B, C], 'm-a'), 'm-a')?.id).toBe('m-b');
  });

  it('배열 순서가 섞여 와도 joinOrder로 고른다', () => {
    expect(nextOwner(trip([C, A, B], 'm-a'), 'm-a')?.id).toBe('m-b');
  });

  it('다시 참여해 joinOrder가 커진 사람은 뒤로 간다', () => {
    const rejoinedB = { ...B, joinOrder: 7 };
    const t = trip([A, rejoinedB, C], 'm-a');
    expect(nextOwner(t, 'm-a')?.id).toBe('m-c');
    expect(pickableMembers(t, 'm-a').map((m) => m.id)).toEqual(['m-c', 'm-b']);
  });

  it('나만 있으면 없다', () => {
    expect(nextOwner(trip([A], 'm-a'), 'm-a')).toBeNull();
  });
});

describe('혼자 남음과 정원', () => {
  it('참여 중인 사람이 1명이면 혼자다', () => {
    expect(isAlone(trip([A], 'm-a'))).toBe(true);
    expect(isAlone(trip([A, B], 'm-a'))).toBe(false);
  });

  it('20명이 차면 더 초대할 수 없다', () => {
    expect(canInvite(19)).toBe(true);
    expect(canInvite(20)).toBe(false);
  });
});

describe('실패 분류', () => {
  it.each([
    [409, 'VERSION_CONFLICT', 'conflict'],
    [403, 'FORBIDDEN', 'notOwner'],
    [404, 'MEMBER_NOT_FOUND', 'memberGone'],
    [404, 'TRIP_NOT_FOUND', 'tripGone'],
    [400, 'VALIDATION_ERROR', 'error'],
    [500, 'INTERNAL_ERROR', 'error'],
  ] as const)('%i %s는 %s', (status, code, expected) => {
    expect(memberActionFailure(apiError(status, code))).toBe(expected);
  });

  it('연결 끊김과 시간 초과는 error다', () => {
    expect(memberActionFailure(apiError(null))).toBe('error');
    const config = { headers: new AxiosHeaders() };
    expect(memberActionFailure(new AxiosError('timeout', 'ECONNABORTED', config))).toBe('error');
  });
});

describe('수정 본문', () => {
  const base: Trip = {
    ...trip([A], 'm-a'),
    title: '겨울 여행',
    startDate: '2026-11-14',
    endDate: '2026-11-15',
    destinationRegionIds: ['r-busan', 'r-gangneung'],
    version: 5,
  };
  const same = {
    title: '겨울 여행',
    range: { start: '2026-11-14', end: '2026-11-15' },
    regionIds: ['r-busan', 'r-gangneung'],
  };

  it('바뀐 게 없으면 null이다', () => {
    expect(buildTripUpdate(base, same)).toBeNull();
    expect(buildTripUpdate(base, { ...same, title: '  겨울 여행  ' })).toBeNull();
  });

  it('바뀐 칸만 담고 이름 앞뒤 공백을 지운다. expectedVersion은 base 버전이다', () => {
    expect(buildTripUpdate(base, { ...same, title: ' 부산 바다 ' })).toEqual({
      expectedVersion: 5,
      title: '부산 바다',
    });
  });

  it('기간을 비우면 시작일·종료일을 둘 다 null로 보낸다', () => {
    expect(buildTripUpdate(base, { ...same, range: null })).toEqual({
      expectedVersion: 5,
      startDate: null,
      endDate: null,
    });
  });

  it('기간을 바꾸면 둘 다 보낸다', () => {
    expect(
      buildTripUpdate(base, { ...same, range: { start: '2026-11-14', end: '2026-11-16' } }),
    ).toEqual({ expectedVersion: 5, startDate: '2026-11-14', endDate: '2026-11-16' });
  });

  it('여행지를 모두 빼면 []이고, 순서만 바뀌어도 바뀐 것이다', () => {
    expect(buildTripUpdate(base, { ...same, regionIds: [] })).toEqual({
      expectedVersion: 5,
      destinationRegionIds: [],
    });
    expect(buildTripUpdate(base, { ...same, regionIds: ['r-gangneung', 'r-busan'] })).toEqual({
      expectedVersion: 5,
      destinationRegionIds: ['r-gangneung', 'r-busan'],
    });
  });
});

describe('충돌 뒤 입력값 다시 정하기', () => {
  const base: Trip = {
    ...trip([A], 'm-a'),
    title: '겨울 여행',
    startDate: '2026-11-14',
    endDate: '2026-11-15',
    destinationRegionIds: ['r-busan'],
    version: 5,
  };
  const untouched = {
    title: '겨울 여행',
    range: { start: '2026-11-14', end: '2026-11-15' },
    regionIds: ['r-busan'],
  };

  it('다른 동행이 기간만 바꿨으면 내가 고친 이름은 남기고 기간은 최신 값을 쓴다', () => {
    const latest = { ...base, startDate: '2026-11-20', endDate: '2026-11-22', version: 6 };
    const merged = mergeAfterConflict(base, { ...untouched, title: '부산 바다' }, latest);

    expect(merged.values).toEqual({
      title: '부산 바다',
      range: { start: '2026-11-20', end: '2026-11-22' },
      regionIds: ['r-busan'],
    });
    expect(merged.keptMine).toEqual({ title: true, range: false, regions: false });
    expect(merged.overlapped).toEqual([]);
    expect(merged.leftToSave).toBe(true);
  });

  it('같은 칸을 서로 다르게 고쳤으면 최신 값을 보이고 겹친 칸으로 알린다', () => {
    const latest = { ...base, title: '친구가 바꾼 이름', version: 6 };
    const merged = mergeAfterConflict(
      base,
      { ...untouched, title: '내가 바꾼 이름', regionIds: [] },
      latest,
    );

    expect(merged.values.title).toBe('친구가 바꾼 이름');
    expect(merged.values.regionIds).toEqual([]);
    expect(merged.overlapped).toEqual(['title']);
    // 여행지는 내 변경이 남아 있다
    expect(merged.leftToSave).toBe(true);
  });

  it('최신 여행이 이미 내 입력과 같으면 저장할 것이 남지 않는다(응답만 놓친 내 저장 포함)', () => {
    const latest = { ...base, title: '부산 바다', version: 6 };
    const merged = mergeAfterConflict(base, { ...untouched, title: '  부산 바다 ' }, latest);

    expect(merged.overlapped).toEqual([]);
    expect(merged.leftToSave).toBe(false);
  });

  it('내가 아무것도 안 고쳤으면 모두 최신 값이다', () => {
    const latest = { ...base, title: '새 이름', destinationRegionIds: [], version: 6 };
    const merged = mergeAfterConflict(base, untouched, latest);

    expect(merged.values).toEqual({
      title: '새 이름',
      range: { start: '2026-11-14', end: '2026-11-15' },
      regionIds: [],
    });
    expect(merged.leftToSave).toBe(false);
  });

  it('기간을 비운 것도 내 변경으로 남긴다', () => {
    const latest = { ...base, title: '새 이름', version: 6 };
    const merged = mergeAfterConflict(base, { ...untouched, range: null }, latest);

    expect(merged.values.range).toBeNull();
    expect(merged.values.title).toBe('새 이름');
    expect(merged.leftToSave).toBe(true);
  });
});
