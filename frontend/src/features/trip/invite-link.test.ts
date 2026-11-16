import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { appInviteLink, inviteTokenOf, toAppInviteLink } from './invite-link';

// 앱에서는 expo-linking이 앱 주소(eodilog://)를 붙인다
jest.mock('expo-linking', () => ({
  createURL: (path: string) => `eodilog://${path}`,
}));
// 넘겨 주는 주소가 있을 때와 없을 때를 모두 보려고 값을 바꿀 수 있게 둔다
const mockEnv: { inviteUrl: string | null } = { inviteUrl: null };
jest.mock('@/config/env', () => ({
  get env() {
    return mockEnv;
  },
}));

afterEach(() => {
  mockEnv.inviteUrl = null;
});

describe('초대 링크', () => {
  it('넘겨 주는 주소가 있으면 메신저에서 눌리는 https 링크를 만들고 토큰은 # 뒤에 둔다', () => {
    mockEnv.inviteUrl = 'https://eodilog.example.com/invite/';
    expect(appInviteLink('abc-DEF_123')).toBe('https://eodilog.example.com/invite/#abc-DEF_123');
    // 끝의 빗금이 없어도 같은 주소다
    mockEnv.inviteUrl = 'https://eodilog.example.com/invite';
    expect(appInviteLink('abc-DEF_123')).toBe('https://eodilog.example.com/invite/#abc-DEF_123');
  });

  it('넘겨 주는 주소가 없으면 이 앱이 받는 주소를 만든다', () => {
    expect(appInviteLink('abc-DEF_123')).toBe('eodilog://invitations/abc-DEF_123');
  });

  it('주소에서 토큰을 꺼낸다', () => {
    expect(inviteTokenOf('ieohaeng://invitations/abc-DEF_123')).toBe('abc-DEF_123');
    expect(inviteTokenOf('eodilog://invitations/abc?x=1')).toBe('abc');
    expect(inviteTokenOf('https://eodilog.example.com/invite/#abc-DEF_123')).toBe('abc-DEF_123');
  });

  it('토큰이 없는 주소는 null', () => {
    expect(inviteTokenOf('')).toBeNull();
    expect(inviteTokenOf('eodilog:')).toBeNull();
    expect(inviteTokenOf('https://eodilog.example.com/invite/#')).toBeNull();
  });

  it('예전 모양으로 저장된 링크를 지금 쓰는 모양으로 바꾼다', () => {
    mockEnv.inviteUrl = 'https://eodilog.example.com/invite/';
    expect(toAppInviteLink('ieohaeng://invitations/abc-DEF_123')).toBe(
      'https://eodilog.example.com/invite/#abc-DEF_123',
    );
    expect(toAppInviteLink('eodilog://invitations/abc-DEF_123')).toBe(
      'https://eodilog.example.com/invite/#abc-DEF_123',
    );
    // 이미 지금 모양이면 그대로다
    expect(toAppInviteLink('https://eodilog.example.com/invite/#abc')).toBe(
      'https://eodilog.example.com/invite/#abc',
    );
  });

  it('토큰을 꺼낼 수 없으면 받은 그대로 둔다', () => {
    expect(toAppInviteLink('')).toBe('');
  });
});
