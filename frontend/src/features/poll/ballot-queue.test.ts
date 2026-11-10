import { describe, expect, it, jest } from '@jest/globals';

import { createBallotQueue, sameSelection } from './ballot-queue';

/** 직접 끝내는 가짜 요청 */
function fakeServer() {
  const calls: { ids: string[]; resolve: (v: string[]) => void; reject: (e: unknown) => void }[] =
    [];
  const send = jest.fn(
    (ids: string[]) =>
      new Promise<string[]>((resolve, reject) => {
        calls.push({ ids, resolve, reject });
      }),
  );
  return { send, calls };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('createBallotQueue', () => {
  it('요청 중에 10번 눌러도 요청은 앞의 것 하나와 마지막 선택 하나, 2번이다', async () => {
    const server = fakeServer();
    const onError = jest.fn();
    const queue = createBallotQueue({ send: server.send, onError });

    queue.submit(['a'], []);
    const taps = [['a', 'b'], ['b'], ['b', 'c'], ['c'], [], ['a'], ['a', 'c'], ['c'], ['b', 'c']];
    for (const ids of taps) queue.submit(ids, []);
    expect(server.send).toHaveBeenCalledTimes(1);

    server.calls[0].resolve(['a']);
    await flush();
    expect(server.send).toHaveBeenCalledTimes(2);
    expect(server.calls[1].ids).toEqual(['b', 'c']);

    server.calls[1].resolve(['b', 'c']);
    await flush();
    expect(server.send).toHaveBeenCalledTimes(2);
    expect(queue.busy()).toBe(false);
    expect(onError).not.toHaveBeenCalled();
  });

  it('남은 선택이 서버에 저장된 선택과 같아지면 보내지 않는다', async () => {
    const server = fakeServer();
    const queue = createBallotQueue({ send: server.send, onError: jest.fn() });
    queue.submit(['a'], []);
    queue.submit(['b'], []);
    queue.submit(['a'], []);
    server.calls[0].resolve(['a']);
    await flush();
    expect(server.send).toHaveBeenCalledTimes(1);
  });

  it('지금 저장된 선택과 같으면 처음부터 보내지 않는다', () => {
    const server = fakeServer();
    const queue = createBallotQueue({ send: server.send, onError: jest.fn() });
    queue.submit(['b', 'a'], ['a', 'b']);
    expect(server.send).not.toHaveBeenCalled();
  });

  it('실패하면 저장하려던 선택을 알리고 남은 선택은 버린다', async () => {
    const server = fakeServer();
    const onError = jest.fn();
    const queue = createBallotQueue({ send: server.send, onError });
    queue.submit(['a'], []);
    queue.submit(['b'], []);
    const error = new Error('끊김');
    server.calls[0].reject(error);
    await flush();
    expect(onError).toHaveBeenCalledWith(error, ['a']);
    expect(server.send).toHaveBeenCalledTimes(1);
    expect(queue.busy()).toBe(false);
  });

  it('실패 뒤 다시 누르면 다시 보낸다', async () => {
    const server = fakeServer();
    const queue = createBallotQueue({ send: server.send, onError: jest.fn() });
    queue.submit(['a'], []);
    server.calls[0].reject(new Error('x'));
    await flush();
    queue.submit(['a'], []);
    expect(server.send).toHaveBeenCalledTimes(2);
  });
});

describe('sameSelection', () => {
  it('순서와 상관없이 같은 선택인지 본다', () => {
    expect(sameSelection(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameSelection(['a'], ['a', 'b'])).toBe(false);
    expect(sameSelection([], [])).toBe(true);
  });
});
