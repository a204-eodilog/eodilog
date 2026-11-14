import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import type { MyProfile, PageResponse } from '@/api/types';
import { ME_QUERY_KEY } from '@/hooks/use-me';
import { realtime } from '@/realtime';

import { catchUpOptions } from './catch-up-options';
import { configureInbound, receive, resyncChat } from './chat-inbound';
import { useChatReads } from './chat-reads';
import { CHAT_ROOMS_KEY, chatRoomKey } from './hooks/chat-keys';
import { attachSendEngine, resendWaitingNow, stopAutoResend } from './hooks/use-send-message';
import { rememberRooms, tripIdOf } from './room-index';
import type { ChatRealtimeEvent, ChatRoom, Message } from './types';

/** 서버가 보내는 개인 채팅 큐(contracts/realtime.md). src/realtime/destinations.ts에 허용돼 있다 */
export const CHAT_DESTINATION = '/user/queue/chat';

/** 받은 본문이 MESSAGE_CREATED 이벤트인지 확인한다. 다른 모양은 버린다 */
export function parseChatEvent(body: unknown): ChatRealtimeEvent | null {
  if (typeof body !== 'object' || body === null) return null;
  const e = body as Partial<ChatRealtimeEvent>;
  if (e.type !== 'MESSAGE_CREATED' || typeof e.roomId !== 'string') return null;
  const m = e.message as Partial<Message> | undefined;
  if (!m || typeof m.id !== 'string' || typeof m.sequence !== 'number') return null;
  return e as ChatRealtimeEvent;
}

/**
 * 실시간 메시지 하나를 캐시에 반영한다(contracts/realtime.md "채팅의 사용" 1~6).
 * 창 넣기·내 말풍선 정리·목록 최근 메시지·빈칸 확인은 입구 하나(receive)가 한다. 여기서는 실시간에만 있는 일(모르는 방·새 동행)만 한다
 */
export function applyChatEvent(queryClient: QueryClient, body: unknown) {
  const event = parseChatEvent(body);
  if (!event) return;
  const { message, roomId } = event;
  const tripId = tripIdOf(roomId) ?? learnRoomFromCache(queryClient, roomId);
  if (!tripId) {
    // 아직 모르는 방(새로 참여한 여행 등). 목록을 다시 받으면 표가 채워진다
    refetchOnce(queryClient, CHAT_ROOMS_KEY);
    return;
  }

  receive(queryClient, tripId, roomId, [message], 'realtime');
  const meId = queryClient.getQueryData<MyProfile>(ME_QUERY_KEY)?.id ?? null;
  // 안 읽은 수를 센다. 그 방을 보고 있으면 대화방 화면이 곧바로 읽음으로 돌린다
  useChatReads.getState().noteMessage(roomId, message.sequence, message.senderId === meId);

  // 모르는 보낸 사람이면 새 동행이다. 닉네임·얼굴을 다시 받는다(research R11)
  if (message.type === 'TEXT' && message.senderId && message.senderId !== meId) {
    const room = queryClient.getQueryData<ChatRoom>(chatRoomKey(tripId));
    if (room && !room.participants.some((p) => p.id === message.senderId)) {
      refetchOnce(queryClient, chatRoomKey(tripId));
      refetchOnce(queryClient, CHAT_ROOMS_KEY);
    }
  }
}

/**
 * 다시 받기를 시작하되, 이미 받는 중이면 새로 시작하지 않고 그 결과를 쓴다(2026-11-06, 트러블슈팅 D2).
 * 예전에는 메시지가 올 때마다 받던 요청을 취소하고 새로 시작해, 모르는 방·새 동행의 메시지 20개가 연달아 오면
 * 목록·방 정보 요청이 20번씩 서버로 나갔다. 받는 중인 요청은 첫 메시지가 온 뒤에 시작했으므로 새 방·새 동행이 이미 들어 있다
 */
function refetchOnce(queryClient: QueryClient, queryKey: readonly unknown[]) {
  void queryClient.invalidateQueries({ queryKey }, { cancelRefetch: false });
}

/**
 * 방 표(room-index)에 없는 방이면 대화방 목록 캐시에서 찾아 표에 넣는다.
 * 표는 목록 화면이 다시 그려질 때 채워지므로, 목록 응답이 막 왔는데 화면이 아직 안 그려졌으면 모르는 방으로 보고 또 받았다
 */
function learnRoomFromCache(queryClient: QueryClient, roomId: string): string | undefined {
  const pages =
    queryClient.getQueryData<InfiniteData<PageResponse<ChatRoom>>>(CHAT_ROOMS_KEY)?.pages;
  const room = pages?.flatMap((p) => p.data).find((r) => r.id === roomId);
  if (!room) return undefined;
  rememberRooms([room]);
  return room.tripId;
}

/**
 * 로그인한 동안 채팅 큐를 구독한다. 앱 층(src/app/_layout.tsx)에서 한 번 부르고, 돌려준 함수로 푼다.
 * 실시간 사이가 비면 빈칸을 채우고, 구독이 끝날 때마다(처음 연결 포함) 놓친 것을 이어 받는다.
 * src/realtime은 이 파일을 모른다(모듈 경계)
 */
export function startChatRealtime(queryClient: QueryClient) {
  const options = catchUpOptions(queryClient);
  configureInbound(options);
  attachSendEngine(queryClient, options.onBlocked);
  const unsubscribe = realtime.subscribe(CHAT_DESTINATION, {
    onMessage: (body) => applyChatEvent(queryClient, body),
    // 다시 연결됐다 = 서버에 닿는다. 놓친 메시지를 이어 받고, 연결을 기다리던 내 메시지를 바로 다시 보낸다
    onResync: () => {
      resyncChat(queryClient, options);
      void resendWaitingNow();
    },
  });
  return () => {
    unsubscribe();
    stopAutoResend();
    attachSendEngine(null);
    configureInbound({});
  };
}
