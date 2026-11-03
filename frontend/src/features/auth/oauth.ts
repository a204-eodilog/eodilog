/** 카카오 로그인에 쓰는 계산. 기기 기능 없이 돌아가서 테스트하기 쉽게 따로 둔다. */

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** 바이트를 base64url(패딩 없음)로 바꾼다. PKCE verifier·challenge 형식 (RFC 7636) */
export function base64UrlFromBytes(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += BASE64_CHARS[(n >> 18) & 63] + BASE64_CHARS[(n >> 12) & 63];
    if (b !== undefined) out += BASE64_CHARS[(n >> 6) & 63];
    if (c !== undefined) out += BASE64_CHARS[n & 63];
  }
  return toBase64Url(out);
}

/** 일반 base64를 base64url(패딩 없음)로 바꾼다 */
export function toBase64Url(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export type RedirectParams = {
  code: string | null;
  state: string | null;
  /** 사용자가 동의를 취소하면 카카오가 error=access_denied를 붙인다 */
  error: string | null;
};

/** 로그인 뒤 돌아온 주소에서 code·state·error를 읽는다. query와 hash 둘 다 본다 */
export function readRedirectParams(url: string): RedirectParams {
  const query = url.split('#')[0].split('?')[1] ?? '';
  const hash = url.split('#')[1] ?? '';
  const params = new URLSearchParams(query || hash);
  return {
    code: params.get('code'),
    state: params.get('state'),
    error: params.get('error'),
  };
}
