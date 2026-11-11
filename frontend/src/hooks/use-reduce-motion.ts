import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * 휴대폰의 "동작 줄이기"(안드로이드 "애니메이션 삭제")가 켜져 있는가.
 * 켜져 있으면 움직임 부품이 움직이지 않고 바로 끝 모양이 된다(theme/motion).
 * 설정 값은 앱 전체가 하나를 같이 본다. 부품마다 따로 물으면 처음 그릴 때 한 번씩 움직였다 멈춘다
 */
let enabled = false;
let started = false;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (next === enabled) return;
  enabled = next;
  for (const notify of listeners) notify();
}

function start() {
  if (started) return;
  started = true;
  void AccessibilityInfo.isReduceMotionEnabled()
    .then(set)
    .catch(() => undefined);
  AccessibilityInfo.addEventListener('reduceMotionChanged', set);
}

function subscribe(notify: () => void) {
  start();
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

/** 지금 값. 부품 밖(움직임을 시작하는 함수 안)에서 쓴다 */
export function isReduceMotion() {
  return enabled;
}

export function useReduceMotion(): boolean {
  return useSyncExternalStore(subscribe, isReduceMotion, isReduceMotion);
}

/** 테스트에서 값을 바꾼다 */
export function setReduceMotionForTest(next: boolean) {
  set(next);
}
