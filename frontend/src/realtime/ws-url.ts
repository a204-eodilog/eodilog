/** 실시간 연결 주소. /api/v1 밖이고 SockJS를 쓰지 않는다(contracts/realtime.md) */
export function wsUrl(apiBaseUrl: string): string {
  const base = apiBaseUrl.replace(/\/+$/, '');
  return `${base.replace(/^http(s?):\/\//, (_, s: string) => `ws${s}://`)}/ws`;
}
