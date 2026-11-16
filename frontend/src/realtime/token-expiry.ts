/**
 * access 토큰(JWT)의 만료 시각(ms). 서버는 이 시각에 실시간 연결을 끊는다(StompSessionExpiry).
 * 서명은 확인하지 않는다. 언제 미리 갱신할지 정하는 데만 쓰고, 믿을지 말지는 서버가 정한다.
 * 읽지 못하면 null. 그때는 미리 갱신하지 않고, 서버가 끊은 뒤 갱신하는 원래 길로 간다
 */
export function tokenExpiresAt(token: string | null): number | null {
  if (!token) return null;
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const claims: unknown = JSON.parse(atob(padded));
    const exp = (claims as { exp?: unknown } | null)?.exp;
    return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}
