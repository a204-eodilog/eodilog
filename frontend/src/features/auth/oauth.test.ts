import { describe, expect, it } from '@jest/globals';

import { base64UrlFromBytes, readRedirectParams, toBase64Url } from './oauth';

describe('base64UrlFromBytes', () => {
  it('RFC 7636 예시 verifier 바이트를 같은 문자열로 만든다', () => {
    // RFC 7636 Appendix B의 32바이트
    const bytes = new Uint8Array([
      116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186, 22, 212, 37, 77,
      105, 214, 191, 240, 91, 88, 5, 88, 83, 132, 141, 121,
    ]);
    expect(base64UrlFromBytes(bytes)).toBe('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
  });

  it('남는 바이트가 있어도 패딩 없이 만든다', () => {
    expect(base64UrlFromBytes(new Uint8Array([0xfb]))).toBe('-w');
    expect(base64UrlFromBytes(new Uint8Array([0xfb, 0xff]))).toBe('-_8');
  });

  it('32바이트 verifier는 43자로 RFC 7636 길이(43~128)를 지킨다', () => {
    expect(base64UrlFromBytes(new Uint8Array(32).fill(7))).toHaveLength(43);
  });
});

describe('toBase64Url', () => {
  it('SHA-256 base64를 challenge 형식으로 바꾼다', () => {
    // RFC 7636 Appendix B의 challenge
    expect(toBase64Url('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw+cM=')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });
});

describe('readRedirectParams', () => {
  it('query의 code와 state를 읽는다', () => {
    expect(readRedirectParams('eodilog://oauth/kakao?code=abc&state=xyz')).toEqual({
      code: 'abc',
      state: 'xyz',
      error: null,
    });
  });

  it('동의를 취소하면 error를 읽는다', () => {
    expect(
      readRedirectParams('http://localhost:8081/oauth/kakao?error=access_denied&state=xyz').error,
    ).toBe('access_denied');
  });

  it('값이 없으면 null', () => {
    expect(readRedirectParams('eodilog://oauth/kakao')).toEqual({
      code: null,
      state: null,
      error: null,
    });
  });
});
