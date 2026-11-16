import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, type InfiniteData } from '@tanstack/react-query';
import { CanceledError } from 'axios';

import type { PageResponse, UserCard } from '@/api/types';
import { ME_QUERY_KEY } from '@/hooks/use-me';

import { getMessages, sendMessage } from './api';
import { catchUp, markRoomOpen, receive, watchLatest } from './chat-inbound';
import { CHAT_ROOMS_KEY, chatMessagesKey, chatRoomKey } from './hooks/chat-keys';
import { useChatOutbox } from './hooks/use-chat-outbox';
import { resendWaitingNow } from './hooks/use-send-message';
import { emptyWindow, mergeMessages } from './message-merge';
import { startChatRealtime } from './realtime-chat';
import { clearRoomIndex, rememberRooms } from './room-index';
import { clearChatSession } from './session-cleanup';
import { msg, range } from './testing';
import type { ChatRoom, Message, MessagePage, MessageWindow } from './types';

/**
 * 로그아웃하면 채팅 받기·보내기 엔진이 멈춰야 한다(2026-11-09 엔진 하나로 묶기).
 * 이어 받기와 보내기가 서버 응답을 기다리는 중에 앱과 같은 순서로 로그아웃한다
 * (캐시 비우기 → 채팅 상태 지우기 → 실시간 정리). 그 뒤 응답이 도착해도 아무것도 바뀌면 안 된다
 */

jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null, devMock: false },
}));
jest.mock('@/realtime', () => ({ realtime: { subscribe: jest.fn(() => () => undefined) } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'cid-1' }));
jest.mock('./api', () => ({
  getMessages: jest.fn(),
  sendMessage: jest.fn(),
  CATCH_UP_LIMIT: 100,
}));

const person = (id: string, nickname: string): UserCard => ({
  id,
  nickname,
  profileImageUrl: null,
  accountVisibility: 'PUBLIC',
  followingStatus: 'NONE',
  followedByStatus: 'NONE',
});
const ROOM: ChatRoom = {
  id: 'room-1',
  type: 'TRIP',
  tripId: 'trip-1',
  participants: [person('me', '영광'), person('user-b', '세은')],
  lastMessage: msg(10),
};

/** 서버 응답을 붙잡아 두는 요청. 취소 신호가 오면 axios처럼 CanceledError로 끝난다 */
type Held<T> = { resolve: (value: T) => void; signal: AbortSignal | undefined };

function hold<T>(list: Held<T>[], signal: AbortSignal | undefined): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    list.push({ resolve, signal });
    signal?.addEventListener('abort', () => reject(new CanceledError()));
  });
}

const flush = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  qc.setQueryData(ME_QUERY_KEY, { id: 'me' });
  qc.setQueryData(chatRoomKey('trip-1'), ROOM);
  qc.setQueryData<InfiniteData<PageResponse<ChatRoom>>>(CHAT_ROOMS_KEY, {
    pages: [{ data: [ROOM], page: { nextCursor: null, hasNext: false } }],
    pageParams: [null],
  });
  qc.setQueryData<MessageWindow>(
    chatMessagesKey('trip-1'),
    mergeMessages(emptyWindow('room-1'), range(1, 10)),
  );
  return qc;
}

const gets: Held<MessagePage>[] = [];
const sends: Held<Message>[] = [];

beforeEach(() => {
  gets.length = 0;
  sends.length = 0;
  clearRoomIndex();
  rememberRooms([ROOM]);
  useChatOutbox.getState().clearAll();
  jest.mocked(getMessages).mockReset();
  jest.mocked(sendMessage).mockReset();
  jest
    .mocked(getMessages)
    .mockImplementation((_room, _req, signal?: AbortSignal) => hold(gets, signal));
  jest
    .mocked(sendMessage)
    .mockImplementation((_room, _body, signal?: AbortSignal) => hold(sends, signal));
});

describe('로그아웃하면 채팅 엔진이 멈춘다', () => {
  it('기다리던 요청을 끊고, 로그아웃 뒤 도착한 응답으로 캐시를 다시 채우지 않는다', async () => {
    const qc = setup();
    const stopRealtime = startChatRealtime(qc);
    const closeRoom = markRoomOpen('trip-1');

    // 이어 받기가 서버 응답을 기다린다
    void catchUp(qc, 'trip-1');
    // 연결을 기다리던 내 메시지를 다시 보내 서버 응답을 기다린다
    const item = useChatOutbox.getState().enqueue('room-1', '안녕');
    useChatOutbox.getState().markWaiting('room-1', item.clientMessageId, Date.now());
    void resendWaitingNow();
    await flush();
    expect(gets).toHaveLength(1);
    expect(sends).toHaveLength(1);

    // 앱의 로그아웃 순서(features/auth/logout.ts → session-store.clearSession → 생명주기 정리)
    qc.clear();
    clearChatSession();
    stopRealtime();
    closeRoom();
    const requestsAtLogout = gets.length + sends.length;

    // 끊기지 않은 요청은 로그아웃 뒤에 응답이 온다
    for (const g of gets) {
      if (!g.signal?.aborted) {
        g.resolve({
          data: range(11, 12).reverse(),
          page: { nextBeforeSequence: null, hasNext: false },
        });
      }
    }
    for (const s of sends) {
      if (!s.signal?.aborted) {
        s.resolve(msg(13, { senderId: 'me', clientMessageId: item.clientMessageId }));
      }
    }
    await flush();

    const inFlight = [...gets.slice(0, 1), ...sends.slice(0, 1)];
    const aborted = inFlight.filter((r) => r.signal?.aborted).length;
    const leftoverWindow = qc.getQueryData<MessageWindow>(chatMessagesKey('trip-1'));
    const requestsAfterLogout = gets.length + sends.length - requestsAtLogout;
    console.log(
      `[stop] 기다리던 요청 ${inFlight.length}개 중 끊긴 것 ${aborted}개, ` +
        `로그아웃 뒤 새 요청 ${requestsAfterLogout}개, ` +
        `로그아웃 뒤 캐시에 다시 생긴 대화 창 ${leftoverWindow ? `1개(메시지 ${leftoverWindow.messages.length}개)` : '0개'}`,
    );

    expect(aborted).toBe(inFlight.length);
    expect(requestsAfterLogout).toBe(0);
    expect(leftoverWindow).toBeUndefined();
    expect(useChatOutbox.getState().items).toEqual({});
  });

  describe('타이머', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('빈칸 채우기 대기와 마지막 메시지 확인 주기도 로그아웃하면 남지 않는다', async () => {
      const qc = setup();
      const stopRealtime = startChatRealtime(qc);
      const closeRoom = markRoomOpen('trip-1');
      // 대화방이 열려 있어 마지막 메시지 확인 주기가 돈다
      const stopWatch = watchLatest(qc, 'trip-1', 'room-1', () => true);
      // 11~12를 건너뛴 13이 와서 빈칸 채우기가 대기 중이다
      receive(qc, 'trip-1', 'room-1', [msg(13)], 'realtime');
      const timersBefore = jest.getTimerCount();

      qc.clear();
      clearChatSession();
      const timersAfter = jest.getTimerCount();
      console.log(
        `[stop] 로그아웃 전 타이머 ${timersBefore}개 → 로그아웃 직후 남은 타이머 ${timersAfter}개`,
      );
      stopRealtime();
      closeRoom();
      stopWatch();

      expect(timersBefore).toBe(2);
      expect(timersAfter).toBe(0);
    });
  });
});
