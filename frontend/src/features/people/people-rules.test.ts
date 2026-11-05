import { describe, expect, it } from '@jest/globals';

import type { UserCard } from '@/api/types';

import {
  afterFollow,
  feedPins,
  followButtonState,
  isLocked,
  profileStats,
  suggestionReason,
} from './people-rules';

const person = (extra: Partial<UserCard> = {}): UserCard => ({
  id: 'u1',
  nickname: '가람',
  profileImageUrl: null,
  accountVisibility: 'PUBLIC',
  followingStatus: 'NONE',
  followedByStatus: 'NONE',
  ...extra,
});

describe('팔로우', () => {
  it('버튼 글자는 팔로우 · 요청됨 · 팔로잉', () => {
    expect(followButtonState(person())).toBe('follow');
    expect(followButtonState(person({ followingStatus: 'REQUESTED' }))).toBe('requested');
    expect(followButtonState(person({ followingStatus: 'ACCEPTED' }))).toBe('following');
  });
  it('비공개 계정은 요청됨, 공개 계정은 바로 팔로잉', () => {
    expect(afterFollow(person({ accountVisibility: 'PRIVATE' })).followingStatus).toBe('REQUESTED');
    expect(afterFollow(person()).followingStatus).toBe('ACCEPTED');
  });
  it('비공개 계정은 팔로우가 수락돼야 여행이 보인다', () => {
    expect(isLocked(person({ accountVisibility: 'PRIVATE' }))).toBe(true);
    expect(isLocked(person({ accountVisibility: 'PRIVATE', followingStatus: 'ACCEPTED' }))).toBe(
      false,
    );
    expect(isLocked(person())).toBe(false);
  });
});

describe('글자', () => {
  it('추천 이유', () => {
    expect(suggestionReason({ user: person(), reason: { kind: 'taste', tags: ['바다'] } })).toBe(
      '공개 취향이 같아요',
    );
    expect(suggestionReason({ user: person(), reason: { kind: 'trips', count: 4 } })).toBe(
      '공개 여행 4개를 올렸어요',
    );
  });
  it('프로필 한 줄. 모르는 수는 빼고, 비공개면 앞에 비공개 계정', () => {
    expect(
      profileStats({ ...person(), feedCount: 3, followerCount: 12, followingCount: 9 }, false),
    ).toBe('공동 피드 3개 · 팔로워 12 · 팔로잉 9');
    expect(profileStats({ ...person(), followerCount: 5, followingCount: 7 }, true)).toBe(
      '비공개 계정 · 팔로워 5 · 팔로잉 7',
    );
    expect(profileStats(person(), false)).toBe('');
  });
});

describe('feedPins', () => {
  it('첫 지역에 꽂고 같은 지역은 묶는다', () => {
    const f = (id: string, code: string) => ({
      id,
      tripId: `t-${id}`,
      title: id,
      regions: [{ id: 'r', code, name: '' }],
    });
    const pins = feedPins([f('봄 경주', '4713000000'), f('가을 경주', '4713000000'), f('x', '0')]);
    expect(pins).toHaveLength(1);
    expect(pins[0]).toMatchObject({ label: '봄 경주 외 1개', feedIds: ['봄 경주', '가을 경주'] });
  });
});
