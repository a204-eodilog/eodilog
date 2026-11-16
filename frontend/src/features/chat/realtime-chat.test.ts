import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, type InfiniteData } from '@tanstack/react-query';

import type { PageResponse, UserCard } from '@/api/types';
import { ME_QUERY_KEY } from '@/hooks/use-me';

import { CHAT_ROOMS_KEY, chatMessagesKey, chatRoomKey } from './hooks/chat-keys';
import { useChatOutbox } from './hooks/use-chat-outbox';
import { emptyWindow, mergeMessages } from './message-merge';
import { getMessages } from './api';
import { configureInbound, gapFillTiming } from './chat-inbound';
import { unreadOf, useChatReads } from './chat-reads';
import { applyChatEvent } from './realtime-chat';
import { clearRoomIndex, rememberRooms } from './room-index';
import { msg, range } from './testing';
import type { ChatRoom, Message, MessageWindow } from './types';

jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null, devMock: false },
}));
jest.mock('@/realtime', () => ({ realtime: { subscribe: jest.fn() } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'cid-1' }));
jest.mock('./api', () => ({
  getMessages: jest.fn(async () => ({
    data: [],
    page: { nextBeforeSequence: null, hasNext: false },
  })),
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

const event = (m: Message) => ({ type: 'MESSAGE_CREATED', roomId: m.roomId, message: m });

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

const lastOfList = (qc: QueryClient) =>
  qc.getQueryData<InfiniteData<PageResponse<ChatRoom>>>(CHAT_ROOMS_KEY)!.pages[0].data[0]
    .lastMessage;

beforeEach(() => {
  clearRoomIndex();
  rememberRooms([ROOM]);
  useChatOutbox.getState().clearAll();
});

describe('실시간 채팅 반영', () => {
  it('표에 없는 방의 이벤트는 대화방 목록을 다시 받게 한다', () => {
    const qc = setup();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    applyChatEvent(qc, event(msg(1, { roomId: 'room-x', id: 'x-1' })));
    expect(spy).toHaveBeenCalledWith({ queryKey: CHAT_ROOMS_KEY }, { cancelRefetch: false });
  });

  it('채팅 탭을 열기 전이라 방을 몰라도 안 읽은 수는 센다', () => {
    // 앱을 켜고 채팅 탭을 열지 않았다: 방 표도 대화방 목록도 없다
    clearRoomIndex();
    useChatReads.getState().clearAll();
    const qc = new QueryClient();
    qc.setQueryData(ME_QUERY_KEY, { id: 'me' });
    applyChatEvent(qc, event(msg(11, { roomId: 'room-1', id: 'm-11', senderId: 'user-b' })));
    const { latest, read } = useChatReads.getState();
    expect(unreadOf(latest['room-1'], read['room-1'])).toBe(1);
  });

  it('열린 방 이벤트는 창에 들어가고 목록의 최근 메시지가 바뀐다', () => {
    const qc = setup();
    applyChatEvent(qc, event(msg(11, { text: '새 소식' })));
    const w = qc.getQueryData<MessageWindow>(chatMessagesKey('trip-1'))!;
    expect(w.newestSequence).toBe(11);
    expect(lastOfList(qc)?.sequence).toBe(11);
  });

  it('같은 메시지가 두 번 와도 창에 하나뿐이고, 작은 sequence로 목록을 되돌리지 않는다', () => {
    const qc = setup();
    applyChatEvent(qc, event(msg(11)));
    applyChatEvent(qc, event(msg(11)));
    applyChatEvent(qc, event(msg(9)));
    const w = qc.getQueryData<MessageWindow>(chatMessagesKey('trip-1'))!;
    expect(w.messages.filter((m) => m.sequence === 11)).toHaveLength(1);
    expect(lastOfList(qc)?.sequence).toBe(11);
  });

  it('내 clientMessageId 이벤트는 보내는 중 항목을 지운다', () => {
    const qc = setup();
    const item = useChatOutbox.getState().enqueue('room-1', '안녕');
    applyChatEvent(qc, event(msg(11, { senderId: 'me', clientMessageId: item.clientMessageId })));
    expect(useChatOutbox.getState().items['room-1']).toBeUndefined();
  });

  it('모르는 보낸 사람이면 대화방 정보를 다시 받는다', () => {
    const qc = setup();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    applyChatEvent(qc, event(msg(11, { senderId: 'newbie' })));
    expect(spy).toHaveBeenCalledWith({ queryKey: chatRoomKey('trip-1') }, { cancelRefetch: false });
  });

  it('실시간 사이가 비면 빈칸 채우기를 한 번만 예약한다', async () => {
    const previous = gapFillTiming.graceMs;
    gapFillTiming.graceMs = 0;
    configureInbound({ log: () => undefined });
    // 서버는 빈칸(11·12)을 돌려준다
    jest.mocked(getMessages).mockResolvedValueOnce({
      data: range(11, 12).reverse(),
      page: { nextBeforeSequence: null, hasNext: false },
    });
    const qc = setup();
    applyChatEvent(qc, event(msg(13)));
    applyChatEvent(qc, event(msg(14)));
    await new Promise((r) => setTimeout(r, 0));
    // 11·12가 비었다. 두 번 봤어도 요청은 한 번이고, 커서(10) 위 빈칸을 받는다
    expect(jest.mocked(getMessages)).toHaveBeenCalledTimes(1);
    expect(jest.mocked(getMessages).mock.calls[0][1]).toEqual({ beforeSequence: 13, limit: 2 });
    gapFillTiming.graceMs = previous;
  });

  it('MESSAGE_CREATED가 아닌 본문은 버린다', () => {
    const qc = setup();
    const before = qc.getQueryData(chatMessagesKey('trip-1'));
    applyChatEvent(qc, { type: 'SOMETHING', roomId: 'room-1' });
    applyChatEvent(qc, 'not json object');
    expect(qc.getQueryData(chatMessagesKey('trip-1'))).toBe(before);
  });

  it('창이 아직 없으면(처음 받기 전) 만들지 않는다', () => {
    const qc = setup();
    qc.removeQueries({ queryKey: chatMessagesKey('trip-1') });
    applyChatEvent(qc, event(msg(11)));
    expect(qc.getQueryData(chatMessagesKey('trip-1'))).toBeUndefined();
    expect(lastOfList(qc)?.sequence).toBe(11);
  });
});
