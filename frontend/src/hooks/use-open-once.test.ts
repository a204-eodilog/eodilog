import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import { OPEN_ONCE_RELEASE_MS, useOpenOnce } from './use-open-once';

/**
 * 화면을 여는 누름은 한 번만 받는다(2026-11-10 점검).
 * 대화방 목록에서 방을 빠르게 두 번 누르면 같은 방이 두 겹으로 열려 뒤로 가기를 두 번 눌러야 했다
 */

// 화면이 다시 앞으로 올 때를 흉내 내려고 포커스 콜백을 꺼내 둔다
let mockFocus: (() => void) | null = null;
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    useFocusEffect: (cb: () => void) => {
      mockFocus = cb;
      useEffect(cb, [cb]);
    },
  };
});

beforeEach(() => {
  jest.useFakeTimers();
  mockFocus = null;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useOpenOnce', () => {
  it('연달아 두 번 불러도 한 번만 실행한다', async () => {
    const open = jest.fn();
    const { result } = await renderHook(() => useOpenOnce(open));
    await act(async () => {
      result.current('room-1');
      result.current('room-1');
    });
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('room-1');
  });

  it('잠긴 동안에는 다른 것을 눌러도 받지 않는다', async () => {
    const open = jest.fn();
    const { result } = await renderHook(() => useOpenOnce(open));
    await act(async () => {
      result.current('room-1');
      result.current('room-2');
    });
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('room-1');
  });

  it('화면이 다시 앞으로 오면 다시 열 수 있다', async () => {
    const open = jest.fn();
    const { result } = await renderHook(() => useOpenOnce(open));
    await act(async () => {
      result.current('room-1');
    });
    await act(async () => {
      mockFocus?.();
    });
    await act(async () => {
      result.current('room-2');
    });
    expect(open).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenLastCalledWith('room-2');
  });

  it('화면 이동이 일어나지 않았어도 잠시 뒤에는 풀린다', async () => {
    const open = jest.fn();
    const { result } = await renderHook(() => useOpenOnce(open));
    await act(async () => {
      result.current('room-1');
    });
    await act(async () => {
      jest.advanceTimersByTime(OPEN_ONCE_RELEASE_MS - 1);
    });
    await act(async () => {
      result.current('room-1');
    });
    expect(open).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    await act(async () => {
      result.current('room-1');
    });
    expect(open).toHaveBeenCalledTimes(2);
  });
});
