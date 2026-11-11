import { afterEach, describe, expect, it } from '@jest/globals';
import { onlineManager } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';

import { usePullRefresh } from './use-pull-refresh';

/**
 * 연결이 끊긴 채 당기면 다시 받기가 연결될 때까지 멈춰 동그라미가 계속 돌았다(2026-11-10 점검)
 */

/** 연결될 때까지 끝나지 않는 다시 받기(끊겼을 때 TanStack refetch와 같다) */
const neverEnds = () => new Promise<unknown>(() => {});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe('usePullRefresh', () => {
  it('다시 받기가 끝나면 동그라미를 끈다', async () => {
    const { result } = await renderHook(() => usePullRefresh(async () => undefined));
    await act(async () => {
      await result.current.onRefresh();
    });
    expect(result.current.refreshing).toBe(false);
  });

  it('끊긴 채 당기면 기다리지 않고 바로 끈다', async () => {
    onlineManager.setOnline(false);
    const { result } = await renderHook(() => usePullRefresh(neverEnds));
    await act(async () => {
      await result.current.onRefresh();
    });
    expect(result.current.refreshing).toBe(false);
  });

  it('당겨서 기다리는 사이 끊기면 그때 끈다', async () => {
    const { result } = await renderHook(() => usePullRefresh(neverEnds));
    let done: Promise<void> | undefined;
    await act(async () => {
      done = result.current.onRefresh();
    });
    expect(result.current.refreshing).toBe(true);

    await act(async () => {
      onlineManager.setOnline(false);
      await done;
    });
    expect(result.current.refreshing).toBe(false);
  });
});
