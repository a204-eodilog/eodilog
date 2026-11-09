/**
 * 구독할 수 있는 목적지. 서버가 허용한 것만 넣는다.
 * 서버는 허용하지 않은 구독에 ERROR FORBIDDEN을 보내고 연결 전체를 닫는다. 그러면 채팅까지 끊기므로
 * 목적지를 더하는 일은 서버 허용과 함께 한다(contracts/realtime.md "모듈 경계")
 */
export const ALLOWED_DESTINATIONS = ['/user/queue/chat'] as const;

export type Destination = (typeof ALLOWED_DESTINATIONS)[number];

export function isAllowedDestination(destination: string): destination is Destination {
  return (ALLOWED_DESTINATIONS as readonly string[]).includes(destination);
}
