import { AxiosError, AxiosHeaders } from 'axios';

import type { Message } from './types';

/** 채팅 단위 테스트용 메시지. sequence만 주면 나머지는 정해진 값으로 채운다 */
export function msg(sequence: number, over: Partial<Message> = {}): Message {
  return {
    id: `msg-${sequence}`,
    roomId: 'room-1',
    sequence,
    senderId: 'user-b',
    type: 'TEXT',
    text: `메시지 ${sequence}`,
    clientMessageId: null,
    eventId: null,
    target: null,
    eventReadAt: null,
    createdAt: '2026-11-05T03:00:00Z',
    deletedAt: null,
    ...over,
  };
}

/** sequence from..to(포함) 메시지 */
export function range(from: number, to: number, over: Partial<Message> = {}): Message[] {
  const out: Message[] = [];
  for (let s = from; s <= to; s += 1) out.push(msg(s, over));
  return out;
}

/** 서버 오류 응답 흉내. status가 null이면 네트워크 끊김 */
export function httpError(status: number | null, code?: string): AxiosError {
  const config = { headers: new AxiosHeaders() };
  if (status === null) return new AxiosError('Network Error', 'ERR_NETWORK', config);
  return new AxiosError('fail', undefined, config, undefined, {
    status,
    statusText: '',
    headers: {},
    config,
    data: code ? { error: { code, message: '' } } : {},
  });
}
