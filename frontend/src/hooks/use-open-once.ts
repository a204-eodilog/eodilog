import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

/** 화면 이동이 일어나지 않았을 때 잠금을 푸는 시간(ms) */
export const OPEN_ONCE_RELEASE_MS = 1000;

/**
 * 화면을 여는 누름을 한 번만 받는다. 목록의 줄처럼 누르면 다른 화면이 열리는 곳에 쓴다.
 * 화면이 바뀌기 전에 두 번째 누름이 들어오면 같은 화면이 두 겹으로 쌓여 뒤로 가기를 두 번 눌러야 했다(2026-11-10 점검).
 * 한 번 받으면 잠그고, 이 화면이 다시 앞으로 올 때 푼다. 잠긴 동안에는 다른 줄을 눌러도 받지 않는다(처음 누른 것만 연다).
 * 화면 이동이 일어나지 않아 다시 앞으로 올 일이 없는 경우를 위해 OPEN_ONCE_RELEASE_MS 뒤에도 푼다
 */
export function useOpenOnce<Args extends unknown[]>(open: (...args: Args) => void) {
  const locked = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const release = useCallback(() => {
    locked.current = false;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  // 열었던 화면에서 돌아왔다. 다시 열 수 있게 한다
  useFocusEffect(release);
  useEffect(() => release, [release]);

  return (...args: Args) => {
    if (locked.current) return;
    locked.current = true;
    timer.current = setTimeout(release, OPEN_ONCE_RELEASE_MS);
    open(...args);
  };
}
