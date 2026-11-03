import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, layout, spacing, typography } from '@/theme';

import { Icon } from './icon';

export type HeaderProps = {
  title?: string;
  /** 제목 아래 작은 줄. "부산 1박 2일" */
  subtitle?: string;
  /** 뒤로 대신 닫기(X)를 쓸 때. 시트·전체 화면 입력에 쓴다 */
  close?: boolean;
  /** 왼쪽 버튼을 아예 없앨 때 */
  hideBack?: boolean;
  onBack?: () => void;
  /** 오른쪽 끝 버튼들 */
  right?: ReactNode;
};

/** 상세·입력 화면 상단 바. 56 높이, 왼쪽 뒤로, 가운데 제목, 오른쪽 버튼. */
export function Header({
  title,
  subtitle,
  close = false,
  hideBack = false,
  onBack,
  right,
}: HeaderProps) {
  const insets = useSafeAreaInsets();
  const goBack = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <View style={styles.side}>
          {hideBack ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={close ? '닫기' : '뒤로'}
              hitSlop={8}
              onPress={goBack}
              style={styles.iconButton}
            >
              <Icon name={close ? 'close' : 'back'} color={colors.text.default} />
            </Pressable>
          )}
        </View>
        <View style={styles.center}>
          {title ? (
            <Text style={[typography.bodyBold, styles.title]} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text style={[typography.caption, styles.subtitle]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={[styles.side, styles.right]}>{right}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.surface.white },
  bar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[8],
  },
  side: { width: 72, flexDirection: 'row', alignItems: 'center' },
  right: { justifyContent: 'flex-end' },
  iconButton: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { flex: 1, alignItems: 'center' },
  title: { color: colors.text.default },
  subtitle: { color: colors.text.sub, marginTop: -2 },
});
