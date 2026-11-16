import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AxiosError, AxiosHeaders } from 'axios';

import { queryClient } from '@/api/query-client';
import { publicClient, refreshAccessToken } from '@/api/session';
import type { Session } from '@/api/types';
import { sendMessage } from '@/features/chat/api';
import { chatMessagesKey } from '@/features/chat/hooks/chat-keys';
import { useChatOutbox } from '@/features/chat/hooks/use-chat-outbox';
import { attachSendEngine, resendWaitingNow } from '@/features/chat/hooks/use-send-message';
import { emptyWindow, mergeMessages } from '@/features/chat/message-merge';
import { clearRoomIndex, rememberRooms } from '@/features/chat/room-index';
import { stopChatSync } from '@/features/chat/sync-session';
import { msg, range } from '@/features/chat/testing';
import type { Message, MessageWindow } from '@/features/chat/types';
import { ME_QUERY_KEY } from '@/hooks/use-me';
import { useSessionStore } from '@/stores/session-store';

import { signOut } from './logout';

/**
 * 로그아웃 뒤 다른 계정으로 로그인했을 때 이전 사용자의 데이터가 남지 않아야 한다(2026-11-09).
 * 로그아웃은 두 경로다. 사용자가 누르는 로그아웃(signOut)과, 로그인 유지 토큰이 만료돼 갱신이 거절된 자동 로그아웃.
 * 앱이 쓰는 실제 queryClient와 실제 로그아웃 함수로 확인한다
 */

jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null, devMock: false },
}));
jest.mock('@/realtime', () => ({ realtime: { subscribe: jest.fn(() => () => undefined) } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'cid-1' }));
jest.mock('./api', () => ({ deleteCurrentSession: jest.fn(async () => undefined) }));
jest.mock('@/features/chat/api', () => ({
  getMessages: jest.fn(),
  sendMessage: jest.fn(),
  CATCH_UP_LIMIT: 100,
}));

/** 기기 저장소. 지우기(remove)를 붙잡아 두면 "로그아웃 중 저장소를 지우는 사이"를 만들 수 있다 */
const mockStore = new Map<string, string>();
const mockGate: { remove: Promise<void> | null } = { remove: null };
jest.mock('@/lib/secure-storage', () => ({
  secureStorage: {
    get: async (key: string) => mockStore.get(key) ?? null,
    set: async (key: string, value: string) => void mockStore.set(key, value),
    remove: async (key: string) => {
      if (mockGate.remove) await mockGate.remove;
      mockStore.delete(key);
    },
  },
}));

function session(userId: string, nickname: string): Session {
  return {
    accessToken: `${userId}-access`,
    refreshToken: `${userId}-refresh`,
    expiresIn: 3600,
    isNewUser: false,
    user: {
      id: userId,
      nickname,
      profileImageUrl: null,
      accountVisibility: 'PUBLIC',
      followingStatus: 'NONE',
      followedByStatus: 'NONE',
      ageBand: null,
      ageUseConsent: false,
      profileCompleted: true,
      profileUrl: '',
    },
  };
}

const ROOM = { id: 'room-1', tripId: 'trip-1' };

/** 영광(이전 사용자)이 앱을 쓰던 상태. 내 정보·여행 목록·대화방 메시지가 캐시에 있다 */
async function signInAsPrevious() {
  await useSessionStore.getState().setSession(session('user-a', '영광'));
  queryClient.setQueryData(ME_QUERY_KEY, session('user-a', '영광').user);
  queryClient.setQueryData(['trips', 'mine'], {
    pages: [{ data: [{ id: 'trip-1', title: '영광의 제주' }] }],
  });
  queryClient.setQueryData<MessageWindow>(
    chatMessagesKey(ROOM.tripId),
    mergeMessages(emptyWindow(ROOM.id), range(1, 3)),
  );
}

const leftovers = () =>
  queryClient
    .getQueryCache()
    .findAll()
    .map((q) => JSON.stringify(q.queryKey));

const flush = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

beforeEach(() => {
  jest.restoreAllMocks();
  queryClient.clear();
  mockStore.clear();
  mockGate.remove = null;
  clearRoomIndex();
  rememberRooms([ROOM]);
  useChatOutbox.getState().clearAll();
  jest.mocked(sendMessage).mockReset();
});

// 앱 공용 queryClient의 정리 타이머(5분)와 채팅 타이머가 남으면 jest가 끝나지 않는다
afterEach(() => {
  queryClient.clear();
  stopChatSync();
});

describe('로그아웃 뒤 다른 계정으로 로그인', () => {
  it('토큰 만료로 자동 로그아웃돼도 이전 사용자의 데이터가 남지 않는다', async () => {
    await signInAsPrevious();

    // 로그인 유지 토큰이 만료돼 서버가 갱신을 거절한다(401) → 자동 로그아웃
    const config = { headers: new AxiosHeaders() };
    jest.spyOn(publicClient, 'post').mockRejectedValue(
      new AxiosError('expired', undefined, config, undefined, {
        status: 401,
        statusText: '',
        headers: {},
        config,
        data: {},
      }),
    );
    await refreshAccessToken();
    expect(useSessionStore.getState().status).toBe('signedOut');
    expect(useSessionStore.getState().expired).toBe(true);

    // 다른 사람(세은)이 같은 폰으로 로그인한다
    await useSessionStore.getState().setSession(session('user-b', '세은'));

    const left = leftovers();
    const me = queryClient.getQueryData<{ nickname: string }>(ME_QUERY_KEY);
    console.log(
      `[sign-out] 토큰 만료 로그아웃 → 다른 계정 로그인: 이전 사용자 데이터 ${left.length}개 남음` +
        (left.length ? ` ${left.join(' ')}, 내 정보 이름 "${me?.nickname}"` : ''),
    );
    expect(left).toEqual([]);
  });

  it('로그아웃 버튼으로 나가는 사이 도착한 채팅 응답도 남지 않는다', async () => {
    await signInAsPrevious();
    attachSendEngine(queryClient);

    // 영광이 보낸 메시지가 서버 응답을 기다린다
    let respond: (m: Message) => void = () => undefined;
    jest.mocked(sendMessage).mockImplementation(
      (_room, _body, signal?: AbortSignal) =>
        new Promise<Message>((resolve, reject) => {
          respond = resolve;
          signal?.addEventListener('abort', () => reject(new Error('canceled')));
        }),
    );
    const item = useChatOutbox.getState().enqueue(ROOM.id, '안녕');
    useChatOutbox.getState().markWaiting(ROOM.id, item.clientMessageId, Date.now());
    void resendWaitingNow();
    await flush();
    expect(jest.mocked(sendMessage)).toHaveBeenCalledTimes(1);

    // 로그아웃 버튼. 기기 저장소의 토큰을 지우는 동안 응답이 도착한다
    let releaseRemove: () => void = () => undefined;
    mockGate.remove = new Promise<void>((r) => {
      releaseRemove = r;
    });
    const signingOut = signOut();
    await flush();
    respond(msg(4, { senderId: 'user-a', clientMessageId: item.clientMessageId }));
    await flush();
    releaseRemove();
    await signingOut;

    // 다른 사람(세은)이 로그인한다
    await useSessionStore.getState().setSession(session('user-b', '세은'));

    const left = leftovers();
    console.log(
      `[sign-out] 로그아웃 버튼 중 채팅 응답 도착 → 다른 계정 로그인: 이전 사용자 데이터 ${left.length}개 남음` +
        (left.length ? ` ${left.join(' ')}` : ''),
    );
    expect(left).toEqual([]);
  });
});
