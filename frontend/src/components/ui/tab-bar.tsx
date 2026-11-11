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
  /** 새 소식 점을 보여 줄 탭. 채팅 안 읽은 메시지 등 */
  badges?: Partial<Record<TabKey, boolean>>;
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
            accessibilityLabel={tab.label}
            onPress={() => {
              // 다른 탭으로 바꿀 때만 가볍게 울린다
              if (!on) haptic.light();
              onChange(tab.key);
            }}
            style={styles.item}
          >
            <TabIcon on={on}>
              <Icon name={tab.icon} color={color} filled={on} />
              {badges[tab.key] ? (
                <View style={styles.dot}>
                  <Dot />
                </View>
              ) : null}
            </TabIcon>
            <Text style={[typography.captionMedium, { color }]}>{tab.label}</Text>
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
  wrap: {
    flexDirection: 'row',
    backgroundColor: colors.surface.white,
    borderTopWidth: 1,
    borderTopColor: colors.line.default,
    paddingTop: spacing[8],
  },
  item: { flex: 1, alignItems: 'center', gap: spacing[2], paddingVertical: spacing[4] },
  dot: { position: 'absolute', top: -2, right: -4 },
});
