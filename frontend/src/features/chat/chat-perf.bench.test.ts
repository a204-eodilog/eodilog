import { describe, expect, it } from '@jest/globals';

import type { UserCard } from '@/api/types';

import { toChatItems } from './chat-items';
import { emptyWindow, holesAboveCursor, mergeMessages } from './message-merge';
import { msg } from './testing';
import type { Message, MessageWindow } from './types';

/**
 * 성능 측정(트러블슈팅 D3). 실시간 메시지 하나가 올 때 하는 계산(창에 합치기 → 빈칸 확인 → 화면 줄 다시 만들기)을
 * 창 크기별로 100번 반복해 걸린 시간을 잰다. 기본 jest 실행에서는 빠지고 측정 설정으로만 돈다.
 *   npm run bench -- chat-perf
 */
const person = (id: string, nickname: string): UserCard => ({
  id,
  nickname,
  profileImageUrl: null,
  accountVisibility: 'PUBLIC',
  followingStatus: 'NONE',
  followedByStatus: 'NONE',
});
const PARTICIPANTS = [
  person('user-a', '나'),
  person('user-b', '친구1'),
  person('user-c', '친구2'),
  person('user-d', '친구3'),
];

/** 하루 이틀에 걸친 대화. 1분에 한두 개, 보낸 사람이 돌아가며 바뀐다 */
function message(sequence: number): Message {
  const at = Date.UTC(2026, 10, 5, 0, 0, 0) + sequence * 40_000;
  return msg(sequence, {
    senderId: PARTICIPANTS[sequence % PARTICIPANTS.length].id,
    createdAt: new Date(at).toISOString(),
  });
}

function windowOf(size: number): MessageWindow {
  const messages: Message[] = [];
  for (let s = 1; s <= size; s += 1) messages.push(message(s));
  return mergeMessages(emptyWindow('room-1'), messages);
}

const INCOMING = 100;
const REPEAT = 7;

function once(size: number): number {
  let w = windowOf(size);
  const t0 = performance.now();
  for (let i = 1; i <= INCOMING; i += 1) {
    w = mergeMessages(w, [message(size + i)]);
    holesAboveCursor(w);
    toChatItems(w, [], { meId: 'user-a', participants: PARTICIPANTS });
  }
  return performance.now() - t0;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

describe('실시간 메시지 100개 처리 시간', () => {
  it.each([30, 500, 2000, 5000])('창 %i개', (size) => {
    once(size); // 데우기
    const times = Array.from({ length: REPEAT }, () => once(size));
    const ms = median(times);
    console.log(
      `[bench] 창 ${size}개 + 실시간 ${INCOMING}개: ${ms.toFixed(1)}ms (메시지당 ${(ms / INCOMING).toFixed(3)}ms)`,
    );
    expect(ms).toBeGreaterThan(0);
  });
});
