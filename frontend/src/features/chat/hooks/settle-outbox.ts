import type { QueryClient } from '@tanstack/react-query';

import type { MyProfile } from '@/api/types';
import { ME_QUERY_KEY } from '@/hooks/use-me';

import { reconcileOutbox } from '../message-merge';
import type { Message } from '../types';

import { useChatOutbox } from './use-chat-outbox';

/**
 * 서버 메시지로 나타난 내 보내는 중 말풍선을 지운다.
 * 실시간·보내기 응답뿐 아니라 빈칸 채우기·이어 받기·처음 받기로 들어와도 지워야, 응답과 실시간을 둘 다 놓친
 * 내 메시지가 "보낸 메시지 + 실패 말풍선"으로 두 번 보이지 않는다(2026-11-06 수정).
 * 내 정보 캐시(use-me)를 읽으므로 가벼운 chat-cache와 따로 둔다(여행 쪽이 chat-cache를 쓴다)
 */
export function settleOutbox(
  queryClient: QueryClient,
  roomId: string,
  messages: readonly Message[],
) {
  const outbox = useChatOutbox.getState();
  const pending = outbox.items[roomId];
  if (!pending || messages.length === 0) return;
  const meId = queryClient.getQueryData<MyProfile>(ME_QUERY_KEY)?.id ?? null;
  const next = reconcileOutbox(pending, messages, meId);
  if (next.length !== pending.length) outbox.replace(roomId, next);
}
