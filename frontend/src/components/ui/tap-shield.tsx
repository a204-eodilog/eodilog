import { usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

/** 화면이 넘어가는 동안 누름을 막는 시간(ms). 화면 넘김 움직임(400ms)보다 조금 길다 */
export const TAP_SHIELD_MS = 450;

/** 아래 탭의 화면들. 탭끼리 옮길 때는 넘김 움직임이 없어 막지 않는다(탭을 빠르게 바꿔 누를 수 있어야 한다) */
const TAB_PATHS = new Set(['/', '/home', '/trips', '/saved', '/chats', '/me']);

/** 이 주소로 옮겨 갈 때 누름을 막아야 하는가 */
export function needsShield(nextPath: string): boolean {
  return !TAB_PATHS.has(nextPath);
}

/**
 * 화면이 바뀐 직후 잠깐 동안 화면 전체의 누름을 막는다.
 *
 * 왜: 카드나 줄을 누르면 새 화면이 옆에서 밀려 들어오는데, 그 0.4초 동안 이전 화면이 아직 보이고 눌린다.
 * 그 사이 한 번 더 누르면 같은 화면을 또 열어 두 겹으로 쌓이고, 뒤로 가기를 두 번 눌러야 했다(2026-11-14 사용자 지적).
 * 누르는 곳마다 따로 막으면(use-open-once) 빠뜨리는 곳이 생겨서, 앱 뿌리에서 한 번에 막는다.
 * 주소가 바뀐 바로 그 그리기에서 막을 켜야 두 번째 누름보다 먼저 덮인다. 그래서 효과가 아니라 그리는 중에 켠다
 */
export function TapShield() {
  const pathname = usePathname();
  const [shield, setShield] = useState({ path: pathname, on: false });
  if (shield.path !== pathname) {
    setShield({ path: pathname, on: needsShield(pathname) });
  }

  useEffect(() => {
    if (!shield.on) return;
    const timer = setTimeout(() => setShield((s) => ({ ...s, on: false })), TAP_SHIELD_MS);
    return () => clearTimeout(timer);
  }, [shield]);

  if (!shield.on) return null;
  return (
    <View
      style={StyleSheet.absoluteFill}
      // 누름을 받아서 아래로 넘기지 않는다
      onStartShouldSetResponder={() => true}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
