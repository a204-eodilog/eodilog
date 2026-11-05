import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  clearInviteLinks,
  forgetInviteLink,
  inviteExpiryLabel,
  isInviteExpired,
  readInviteLink,
  saveInviteLink,
} from './invite-storage';

const mockMemory = new Map<string, string>();

jest.mock('@/lib/secure-storage', () => ({
  secureStorage: {
    get: async (key: string) => mockMemory.get(key) ?? null,
    set: async (key: string, value: string) => {
      mockMemory.set(key, value);
    },
    remove: async (key: string) => {
      mockMemory.delete(key);
    },
  },
}));

const NOW = new Date('2026-11-05T00:00:00Z');
const LINK = { url: 'ieohaeng://invitations/abc', expiresAt: '2026-11-12T00:00:00Z' };

beforeEach(() => {
  mockMemory.clear();
});

describe('읽기', () => {
  it('같은 사용자는 저장한 링크를 그대로 읽는다', async () => {
    await saveInviteLink('u1', 't1', LINK, NOW);
    expect(await readInviteLink('u1', 't1', NOW)).toEqual(LINK);
  });

  it('다른 사용자에게는 보이지 않는다', async () => {
    await saveInviteLink('u1', 't1', LINK, NOW);
    expect(await readInviteLink('u2', 't1', NOW)).toBeNull();
  });

  it('만료 1초 전에는 있고 만료 시각 정각부터는 없다', async () => {
    await saveInviteLink('u1', 't1', LINK, NOW);
    expect(await readInviteLink('u1', 't1', new Date('2026-11-11T23:59:59Z'))).toEqual(LINK);
    expect(await readInviteLink('u1', 't1', new Date('2026-11-12T00:00:00Z'))).toBeNull();
    expect(isInviteExpired(LINK, new Date('2026-11-12T00:00:00Z'))).toBe(true);
  });

  it('깨진 값은 없는 것으로 본다', async () => {
    mockMemory.set('eodilog.invites', '{not json');
    expect(await readInviteLink('u1', 't1', NOW)).toBeNull();
  });
});

describe('쓰기와 지우기', () => {
  it('저장할 때 만료된 다른 여행의 링크를 지운다', async () => {
    const old = { url: 'ieohaeng://invitations/old', expiresAt: '2026-11-04T00:00:00Z' };
    mockMemory.set('eodilog.invites', JSON.stringify({ userId: 'u1', links: { t0: old } }));
    await saveInviteLink('u1', 't1', LINK, NOW);
    const stored = JSON.parse(mockMemory.get('eodilog.invites') ?? '{}');
    expect(Object.keys(stored.links)).toEqual(['t1']);
  });

  it('사용자가 바뀌면 이전 사용자의 링크를 모두 버린다', async () => {
    await saveInviteLink('u1', 't1', LINK, NOW);
    await saveInviteLink('u2', 't2', LINK, NOW);
    expect(await readInviteLink('u2', 't1', NOW)).toBeNull();
    expect(await readInviteLink('u2', 't2', NOW)).toEqual(LINK);
  });

  it('여행 하나를 지워도 나머지는 남는다', async () => {
    await saveInviteLink('u1', 't1', LINK, NOW);
    await saveInviteLink('u1', 't2', LINK, NOW);
    await forgetInviteLink('t1');
    expect(await readInviteLink('u1', 't1', NOW)).toBeNull();
    expect(await readInviteLink('u1', 't2', NOW)).toEqual(LINK);
  });

  it('로그아웃하면 전부 지운다', async () => {
    await saveInviteLink('u1', 't1', LINK, NOW);
    await clearInviteLinks();
    expect(mockMemory.size).toBe(0);
  });
});

describe('만료 표시', () => {
  it('서울 날짜로 바꿔 보인다. 15:00Z가 서울 자정이다', () => {
    expect(inviteExpiryLabel('2026-11-11T15:00:00Z')).toBe('11.12(목)까지 쓸 수 있어요');
    expect(inviteExpiryLabel('2026-11-11T14:59:59Z')).toBe('11.11(수)까지 쓸 수 있어요');
  });
});
