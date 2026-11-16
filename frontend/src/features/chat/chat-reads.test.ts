import { beforeEach, describe, expect, it } from '@jest/globals';

import { unreadLabel, unreadOf, useChatReads } from './chat-reads';

const reads = () => useChatReads.getState();
const unread = (roomId: string) => unreadOf(reads().latest[roomId], reads().read[roomId]);

beforeEach(() => reads().clearAll());

describe('unreadOf / unreadLabel', () => {
  it('최근 순번에서 읽은 순번을 뺀다. 기록이 없으면 0', () => {
    expect(unreadOf(10, 7)).toBe(3);
    expect(unreadOf(10, 10)).toBe(0);
    expect(unreadOf(5, 9)).toBe(0);
    expect(unreadOf(10, undefined)).toBe(0);
    expect(unreadOf(undefined, 3)).toBe(0);
  });

  it('0이면 배지가 없고 99를 넘으면 99+', () => {
    expect(unreadLabel(0)).toBeNull();
    expect(unreadLabel(3)).toBe('3');
    expect(unreadLabel(99)).toBe('99');
    expect(unreadLabel(100)).toBe('99+');
  });
});

describe('채팅 안 읽은 수', () => {
  it('목록에서 처음 본 방은 지난 대화를 안 읽음으로 세지 않는다', () => {
    reads().noteRoom('r1', 40);
    expect(unread('r1')).toBe(0);
  });

  it('새 메시지가 올 때마다 하나씩 늘고, 방을 열면 0이 된다', () => {
    reads().noteRoom('r1', 40);
    reads().noteMessage('r1', 41, false);
    reads().noteMessage('r1', 42, false);
    expect(unread('r1')).toBe(2);
    reads().markRead('r1', 42);
    expect(unread('r1')).toBe(0);
  });

  it('같은 메시지를 두 번 받아도 한 번만 센다', () => {
    reads().noteRoom('r1', 40);
    reads().noteMessage('r1', 41, false);
    reads().noteMessage('r1', 41, false);
    expect(unread('r1')).toBe(1);
  });

  it('처음 보는 방에 온 새 메시지는 그 하나만 안 읽음', () => {
    reads().noteMessage('r2', 17, false);
    expect(unread('r2')).toBe(1);
  });

  it('내가 보낸 메시지는 안 읽음으로 세지 않고, 그 앞까지도 읽은 것으로 친다', () => {
    reads().noteRoom('r1', 40);
    reads().noteMessage('r1', 41, false);
    reads().noteMessage('r1', 42, true);
    expect(unread('r1')).toBe(0);
  });

  it('목록을 다시 받아 최근 순번이 늘어 있으면 그만큼 안 읽음', () => {
    reads().noteRoom('r1', 40);
    reads().noteRoom('r1', 45);
    expect(unread('r1')).toBe(5);
  });

  it('읽은 자리는 뒤로 돌아가지 않는다', () => {
    reads().markRead('r1', 50);
    reads().markRead('r1', 30);
    expect(reads().read.r1).toBe(50);
  });
});

describe('방 기록 지우기', () => {
  it('지운 방은 채팅 탭 배지 합계에서 빠지고 다른 방은 그대로다', () => {
    reads().noteRoom('r1', 10);
    reads().noteMessage('r1', 13, false);
    reads().noteRoom('r2', 5);
    reads().noteMessage('r2', 6, false);
    reads().forgetRoom('r1');
    expect(reads().latest.r1).toBeUndefined();
    expect(reads().read.r1).toBeUndefined();
    expect(unread('r2')).toBe(1);
  });
});
