import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import { useConnectionStore } from '@/realtime/connection-store';

import { useReconnected } from './use-reconnected';

const dispatch = (
  ...events: Parameters<ReturnType<typeof useConnectionStore.getState>['dispatch']>[0][]
) =>
  act(() => {
    for (const e of events) useConnectionStore.getState().dispatch(e);
  });

beforeEach(() => {
  useConnectionStore.getState().dispatch({ type: 'signOut' });
});

afterEach(() => {
  useConnectionStore.getState().dispatch({ type: 'signOut' });
});

it('처음 연결될 때는 부르지 않는다', async () => {
  const fn = jest.fn();
  await renderHook(() => useReconnected(fn));
  await dispatch({ type: 'start' }, { type: 'connected' });
  expect(fn).not.toHaveBeenCalled();
});

it('끊겼다가 다시 연결되면 한 번 부른다', async () => {
  const fn = jest.fn();
  await renderHook(() => useReconnected(fn));
  await dispatch({ type: 'start' }, { type: 'connected' });
  await dispatch({ type: 'dropped', at: Date.now() });
  expect(fn).not.toHaveBeenCalled();
  await dispatch({ type: 'connected' });
  expect(fn).toHaveBeenCalledTimes(1);
});

it('백그라운드에서 돌아와 연결돼도 부른다', async () => {
  const fn = jest.fn();
  await renderHook(() => useReconnected(fn));
  await dispatch({ type: 'start' }, { type: 'connected' }, { type: 'background' });
  await dispatch({ type: 'foreground' });
  await dispatch({ type: 'connected' });
  expect(fn).toHaveBeenCalledTimes(1);
});

it('가장 최근에 넘긴 함수를 부른다', async () => {
  const first = jest.fn();
  const second = jest.fn();
  const { rerender } = await renderHook(({ cb }: { cb: () => void }) => useReconnected(cb), {
    initialProps: { cb: first },
  });
  await rerender({ cb: second });
  await dispatch({ type: 'start' }, { type: 'connected' }, { type: 'dropped', at: Date.now() });
  await dispatch({ type: 'connected' });
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
});
