import { describe, expect, it } from '@jest/globals';

import { tokenExpiresAt } from './token-expiry';

const encode = (value: unknown) => {
  // 한글이 섞여도 되게 UTF-8 바이트로 바꾼 뒤 base64url로 만든다
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

const jwt = (claims: unknown) => `${encode({ alg: 'HS256' })}.${encode(claims)}.signature`;

describe('tokenExpiresAt', () => {
  it('exp(초)를 ms로 돌려준다', () => {
    expect(tokenExpiresAt(jwt({ sub: 'u1', exp: 1_800_000_000 }))).toBe(1_800_000_000_000);
  });

  it('base64url 글자(-, _)와 빠진 채움 글자도 읽는다', () => {
    // 한글이 들어가면 -, _가 섞인 본문이 나온다
    const token = jwt({ iss: '어디로그?>', exp: 1_800_000_001 });
    expect(tokenExpiresAt(token)).toBe(1_800_000_001_000);
  });

  it.each([
    ['토큰 없음', null],
    ['빈 문자열', ''],
    ['점이 없는 문자열', 'not-a-jwt'],
    ['본문이 JSON이 아님', 'a.%%%.c'],
    ['exp 없음', jwt({ sub: 'u1' })],
    ['exp가 숫자가 아님', jwt({ exp: '1800000000' })],
  ])('%s이면 null', (_name, token) => {
    expect(tokenExpiresAt(token)).toBeNull();
  });
});
