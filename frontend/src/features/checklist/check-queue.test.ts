import { describe, expect, it, jest } from '@jest/globals';

import { createCheckQueue } from './check-queue';
import { checklistItem } from './testing';
import type { ChecklistItem } from './types';

/** 응답을 직접 풀어 주는 가짜 서버 */
function fakeServer() {
  const calls: { checked: boolean; version: number }[] = [];
  const pending: (() => void)[] = [];
  const send = jest.fn((item: ChecklistItem, checked: boolean) => {
    calls.push({ checked, version: item.version });
    return new Promise<ChecklistItem>((resolve) => {
      pending.push(() =>
        resolve({
          ...item,
          checked,
          checkedByMemberId: checked ? 'm-me' : null,
          version: item.version + 1,
        }),
      );
    });
  });
  const flush = async () => {
    while (pending.length > 0) {
      pending.shift()?.();
      await Promise.resolve();
      await Promise.resolve();
    }
  };
  return { send, calls, flush };
}

describe('체크 저장 줄', () => {
  it('5번 연타해도 요청은 3번 이하이고 마지막 상태가 남는다', async () => {
    const server = fakeServer();
    const saved: ChecklistItem[] = [];
    const queue = createCheckQueue({
      send: server.send,
      onSaved: (item) => saved.push(item),
      onError: () => {},
    });
    const item = checklistItem({ id: 'a', checked: false, version: 1 });
    let shown = false;
    for (let i = 0; i < 5; i += 1) {
      shown = !shown;
      queue.toggle(item, shown);
    }
    await server.flush();
    expect(server.calls.length).toBeLessThanOrEqual(3);
    expect(saved.at(-1)?.checked).toBe(true);
  });

  it('4번 누르면 해제로 끝나고 이어 보낼 때 받은 version을 쓴다', async () => {
    const server = fakeServer();
    const queue = createCheckQueue({ send: server.send, onSaved: () => {}, onError: () => {} });
    const item = checklistItem({ id: 'a', checked: false, version: 7 });
    queue.toggle(item, true);
    queue.toggle(item, false);
    queue.toggle(item, true);
    queue.toggle(item, false);
    await server.flush();
    expect(server.calls).toEqual([
      { checked: true, version: 7 },
      { checked: false, version: 8 },
    ]);
  });

  it('서버 상태와 같은 상태면 보내지 않는다', async () => {
    const server = fakeServer();
    const queue = createCheckQueue({ send: server.send, onSaved: () => {}, onError: () => {} });
    queue.toggle(checklistItem({ id: 'a', checked: true }), true);
    await server.flush();
    expect(server.send).not.toHaveBeenCalled();
  });

  it('보내는 중에 다시 누르면 남은 상태를 알려 준다', async () => {
    const server = fakeServer();
    const onSaved = jest.fn();
    const queue = createCheckQueue({ send: server.send, onSaved, onError: () => {} });
    const item = checklistItem({ id: 'a', checked: false });
    queue.toggle(item, true);
    queue.toggle(item, false);
    await server.flush();
    expect(onSaved.mock.calls[0][1]).toBe(false);
    expect(onSaved.mock.calls[1][1]).toBeNull();
  });

  it('실패하면 마지막 서버 항목을 넘기고 남은 요청을 버린다', async () => {
    const error = new Error('network');
    const send = jest.fn(() => Promise.reject(error));
    const onError = jest.fn();
    const queue = createCheckQueue({ send, onSaved: () => {}, onError });
    const item = checklistItem({ id: 'a', checked: false, version: 3 });
    queue.toggle(item, true);
    queue.toggle(item, false);
    await Promise.resolve();
    await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(item, error);
    expect(queue.isSending('a')).toBe(false);
  });

  it('항목마다 따로 보낸다', async () => {
    const server = fakeServer();
    const queue = createCheckQueue({ send: server.send, onSaved: () => {}, onError: () => {} });
    queue.toggle(checklistItem({ id: 'a' }), true);
    queue.toggle(checklistItem({ id: 'b' }), true);
    expect(server.send).toHaveBeenCalledTimes(2);
    await server.flush();
  });
});
