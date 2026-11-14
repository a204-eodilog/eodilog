import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isReduceMotion } from '@/hooks/use-reduce-motion';
import { haptic } from '@/lib/haptics';
import { colors, spacing, typography } from '@/theme';
import { motion } from '@/theme/motion';

import { Dot, Icon, type IconName } from './icon';

export type TabKey = 'home' | 'trip' | 'bookmark' | 'chat' | 'me';

export const TABS: { key: TabKey; label: string; icon: IconName }[] = [
  { key: 'home', label: '홈', icon: 'home' },
  { key: 'trip', label: '여행', icon: 'trip' },
  { key: 'bookmark', label: '저장', icon: 'bookmark' },
  { key: 'chat', label: '채팅', icon: 'chat' },
  { key: 'me', label: '마이페이지', icon: 'person' },
];

export type TabBarProps = {
  active: TabKey;
  onChange: (key: TabKey) => void;
  /**
   * 탭 아이콘 오른쪽 위 표시. true면 새 소식 점, 글자("3", "99+")면 빨간 숫자 알약(채팅 안 읽은 메시지 수).
   * false·없음이면 그리지 않는다
   */
  badges?: Partial<Record<TabKey, boolean | string>>;
};

/** 하단 탭. 각 탭의 첫 화면에만 보인다. 고른 탭은 파랑, 나머지는 회색. */
export function TabBar({ active, onChange, badges = {} }: TabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, spacing[8]) }]}>
      {TABS.map((tab) => {
        const on = tab.key === active;
        const color = on ? colors.brand.primaryDark : colors.text.sub;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={
              typeof badges[tab.key] === 'string'
                ? `${tab.label}, 안 읽은 메시지 ${badges[tab.key]}개`
                : tab.label
            }
            onPress={() => {
              // 다른 탭으로 바꿀 때만 가볍게 울린다
              if (!on) haptic.light();
              onChange(tab.key);
            }}
            style={styles.item}
          >
            <TabIcon on={on}>
              <Icon name={tab.icon} color={color} filled={on} />
              {typeof badges[tab.key] === 'string' ? (
                <View style={styles.count}>
                  <Text style={[typography.micro, styles.countText]}>{badges[tab.key]}</Text>
                </View>
              ) : badges[tab.key] ? (
                <View style={styles.dot}>
                  <Dot />
                </View>
              ) : null}
            </TabIcon>
            <Text style={[typography.captionMedium, styles.label, { color }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 탭을 고르면 아이콘이 작아졌다가 스프링으로 돌아오며 통 튄다(theme/motion). 처음 그릴 때는 움직이지 않는다 */
function TabIcon({ on, children }: { on: boolean; children: ReactNode }) {
  const scale = useState(() => new Animated.Value(1))[0];
  const wasOn = useRef(on);
  useEffect(() => {
    if (wasOn.current === on) return;
    wasOn.current = on;
    if (!on || isReduceMotion()) return;
    scale.setValue(motion.tab.fromScale);
    const popping = Animated.spring(scale, {
      toValue: 1,
      ...motion.press.spring,
      useNativeDriver: motion.native,
    });
    popping.start();
    return () => popping.stop();
  }, [on, scale]);
  return <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  // 탭 글자는 12로 둔다. 보조 글자 기준이 13으로 커졌지만 탭 다섯 개가 한 줄에 서려면 12가 맞다
  label: { fontSize: 12 },
  wrap: {
    flexDirection: 'row',
    backgroundColor: colors.surface.white,
    borderTopWidth: 1,
    borderTopColor: colors.line.default,
    paddingTop: spacing[8],
  },
  item: { flex: 1, alignItems: 'center', gap: spacing[2], paddingVertical: spacing[4] },
  dot: { position: 'absolute', top: -2, right: -4 },
  // 숫자 알약. 아이콘 오른쪽 위에 걸치고, 흰 테두리로 아이콘과 떼어 보인다
  count: {
    position: 'absolute',
    top: -6,
    left: 14,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.status.danger,
    borderWidth: 1.5,
    borderColor: colors.surface.white,
  },
  countText: { color: colors.text.inverse },
});
