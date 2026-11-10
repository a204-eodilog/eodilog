import { describe, expect, it } from '@jest/globals';

import { afterLoginHref } from './after-login';

describe('afterLoginHref', () => {
  it('가입 대기면 초대와 상관없이 S02 프로필', () => {
    expect(afterLoginHref({ profileCompleted: false, isNewUser: true, inviteToken: 't' })).toBe(
      '/profile',
    );
  });

  it('카카오 닉네임으로 바로 가입된 첫 가입도 S02 프로필(닉네임 확인·연령대 입력, 초대는 S02 뒤 S04)', () => {
    expect(afterLoginHref({ profileCompleted: true, isNewUser: true, inviteToken: null })).toBe(
      '/profile',
    );
    expect(afterLoginHref({ profileCompleted: true, isNewUser: true, inviteToken: 't' })).toBe(
      '/profile',
    );
  });

  it('기존 회원은 홈, 초대로 왔으면 첫 가입 표시 없이 S04', () => {
    expect(afterLoginHref({ profileCompleted: true, isNewUser: false, inviteToken: null })).toBe(
      '/home',
    );
    expect(afterLoginHref({ profileCompleted: true, isNewUser: false, inviteToken: 't' })).toEqual({
      pathname: '/invitations/[token]',
      params: { token: 't' },
    });
  });
});
