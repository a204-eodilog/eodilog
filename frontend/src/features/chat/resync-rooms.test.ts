import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { InfiniteQueryObserver, QueryClient, focusManager } from '@tanstack/react-query';

import { resyncChat } from './chat-inbound';
import { CHAT_ROOMS_KEY } from './hooks/chat-keys';

/**
 * 앱을 다시 열 때 대화방 목록을 한 번만 받는다(2026-11-09).
 * 앱이 앞으로 오면 (1) 오래된 쿼리를 다시 받고 (2) 실시간이 다시 연결되며 대화방 목록을 다시 받게 한다.
 * (2)가 (1)에서 받고 있던 요청을 끊고 처음부터 다시 받으면 같은 목록을 두 번 받는다
 */

jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null, devMock: false },
}));
jest.mock('./api', () => ({ getMessages: jest.fn(), CATCH_UP_LIMIT: 100 }));

const flush = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

afterEach(() => {
  focusManager.setFocused(undefined);
});

describe('앱 복귀 때 대화방 목록 요청', () => {
  it('앱 복귀로 받고 있던 목록을 다시 연결이 끊지 않고 그 결과를 쓴다', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 0, retry: false } } });
    // 앱처럼 앱 복귀(포커스)를 듣게 한다(QueryClientProvider가 하는 일)
    qc.mount();
    const calls: { signal: AbortSignal; resolve: () => void }[] = [];
    const observer = new InfiniteQueryObserver(qc, {
      queryKey: CHAT_ROOMS_KEY,
      queryFn: ({ signal }) =>
        new Promise((resolve) => {
          calls.push({ signal, resolve: () => resolve({ data: [], page: { hasNext: false } }) });
        }),
      initialPageParam: null,
      getNextPageParam: () => undefined,
    });
    const stop = observer.subscribe(() => undefined);
    await flush();
    calls[0].resolve();
    await flush();
    const before = calls.length;

    // 앱이 백그라운드에 갔다가 돌아온다 → 오래된 대화방 목록을 다시 받기 시작한다
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await flush();
    // 곧이어 실시간이 다시 연결된다
    resyncChat(qc);
    await flush();
    for (const c of calls.slice(before)) if (!c.signal.aborted) c.resolve();
    await flush();

    const requests = calls.length - before;
    const aborted = calls.slice(before).filter((c) => c.signal.aborted).length;
    console.log(
      `[resync] 앱 복귀 한 번에 대화방 목록 요청 ${requests}번 (그중 끊긴 것 ${aborted}번)`,
    );
    expect(requests).toBe(1);
    expect(aborted).toBe(0);
    expect(qc.getQueryState(CHAT_ROOMS_KEY)?.isInvalidated).toBe(false);
    stop();
    qc.unmount();
  });
});
