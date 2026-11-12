import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryObserver } from '@tanstack/react-query';

import { markHomeStale, refetchStaleHome } from './home-cache';

const clients: QueryClient[] = [];
afterEach(() => {
  clients.forEach((c) => c.clear());
  clients.length = 0;
});

/** 홈 화면이 떠 있는 것처럼 ['home', 'map']·['home', 'discovery']를 구독해 둔다 */
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  });
  clients.push(client);
  const map = jest.fn(async () => ['map']);
  const discovery = jest.fn(async () => ['discovery']);
  const observers = [
    new QueryObserver(client, { queryKey: ['home', 'map'], queryFn: map }),
    new QueryObserver(client, { queryKey: ['home', 'discovery'], queryFn: discovery }),
  ];
  const stops = observers.map((o) => o.subscribe(() => undefined));
  return { client, map, discovery, stop: () => stops.forEach((s) => s()) };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('홈 자료 새로 받기 표시', () => {
  it('팔로우를 바꾸면 표시만 하고 그 자리에서 다시 받지 않는다', async () => {
    const { client, map, stop } = setup();
    await settle();
    expect(map).toHaveBeenCalledTimes(1);

    await markHomeStale(client);
    await settle();

    expect(client.getQueryState(['home', 'map'])?.isInvalidated).toBe(true);
    expect(map).toHaveBeenCalledTimes(1);
    stop();
  });

  it('홈에 돌아오면 표시된 자료만 다시 받는다', async () => {
    const { client, map, discovery, stop } = setup();
    await settle();
    // 지도만 표시한다(추천은 그대로)
    await client.invalidateQueries({ queryKey: ['home', 'map'], refetchType: 'none' });

    await refetchStaleHome(client);

    expect(map).toHaveBeenCalledTimes(2);
    expect(discovery).toHaveBeenCalledTimes(1);
    expect(client.getQueryState(['home', 'map'])?.isInvalidated).toBe(false);
    stop();
  });

  it('표시가 없으면 홈에 돌아와도 다시 받지 않는다', async () => {
    const { client, map, discovery, stop } = setup();
    await settle();

    await refetchStaleHome(client);

    expect(map).toHaveBeenCalledTimes(1);
    expect(discovery).toHaveBeenCalledTimes(1);
    stop();
  });
});
