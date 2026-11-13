import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, layout, spacing, typography } from '@/theme';

import { FadeIn } from './fade-in';
import { Icon, type IconName } from './icon';

export type HeaderProps = {
  title?: string;
  /** 제목 아래 작은 줄. "부산 1박 2일" */
  subtitle?: string;
  /** 작은 줄 앞 아이콘(16). 있으면 글자도 아이콘 색(text.icon)으로 맞춘다(Figma S35 여행 이름) */
  subtitleIcon?: IconName;
  /** 뒤로 대신 닫기(X)를 쓸 때. 시트·전체 화면 입력에 쓴다 */
  close?: boolean;
  /** 왼쪽 버튼을 아예 없앨 때 */
  hideBack?: boolean;
  onBack?: () => void;
  /** 오른쪽 끝 버튼들 */
  right?: ReactNode;
  /**
   * 큰 제목(title1, 23). 피그마 S18 동행 초대·S19 여행 설정처럼 제목만 크게 쓰는 화면.
   * 기본은 bodyBold(16)로 S35 경비·S36 정산 문서 기준이다
   */
  largeTitle?: boolean;
  /**
   * 양쪽 칸 너비(기본 72). 오른쪽에 글자 버튼(S35 [말로 한 번에])을 둘 때 넓힌다.
   * 제목이 가운데 오도록 왼쪽도 같은 너비가 된다
   */
  sideWidth?: number;
};

/** 상세·입력 화면 상단 바. 56 높이, 왼쪽 뒤로, 가운데 제목, 오른쪽 버튼. */
export function Header({
  title,
  subtitle,
  subtitleIcon,
  close = false,
  hideBack = false,
  onBack,
  right,
  largeTitle = false,
  sideWidth,
}: HeaderProps) {
  const side = sideWidth ? [styles.side, { width: sideWidth }] : styles.side;
  const insets = useSafeAreaInsets();
  const goBack = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <View style={side}>
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
          {title && largeTitle ? (
            // 큰 제목은 화면을 열 때 가려진 틀 아래에서 솟아오른다
            <FadeIn from="mask">
              <Text style={[typography.title1, styles.title]} numberOfLines={1}>
                {title}
              </Text>
            </FadeIn>
          ) : title ? (
            <Text style={[typography.bodyBold, styles.title]} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          {subtitle && subtitleIcon ? (
            <View style={styles.subtitleRow}>
              <Icon name={subtitleIcon} size={16} color={colors.text.icon} />
              <Text style={[typography.caption, styles.subtitleWithIcon]} numberOfLines={1}>
                {subtitle}
              </Text>
            </View>
          ) : subtitle ? (
            <Text style={[typography.caption, styles.subtitle]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={[side, styles.right]}>{right}</View>
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
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[4], marginTop: -2 },
  subtitleWithIcon: { color: colors.text.icon },
});
