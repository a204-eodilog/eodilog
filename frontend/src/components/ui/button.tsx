import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, Text, type ViewStyle } from 'react-native';
import { Spinner } from './spinner';

import { isReduceMotion } from '@/hooks/use-reduce-motion';
import { haptic } from '@/lib/haptics';
import { colors, radius, size, spacing, typography } from '@/theme';
import { motion } from '@/theme/motion';

import { AnimatedPressable } from './animated-pressable';
import { Icon, type IconName } from './icon';
import { usePressScale } from './use-press-scale';

type Variant = 'primary' | 'secondary' | 'neutral' | 'danger' | 'text';
type Size = 'sm' | 'md' | 'lg' | 'xl';

export type ButtonProps = {
  /** 버튼 글자. icon을 주면 화면에는 그리지 않고 화면 읽어 주기만 읽는다 */
  label: string;
  /**
   * 아이콘만 그린다(2026-11-12 사용자 요청: 아이콘으로 뜻이 통하는 버튼은 글자를 없앤다).
   * 저장은 check, 다시 시도는 refresh, 추가는 plus, 삭제는 trash, 취소는 close처럼 화면마다 같은 아이콘을 쓴다.
   * 가로로 채우지 않으면 동그라미가 된다
   */
  icon?: IconName;
  /** 아이콘 옆에 붙는 짧은 숫자("3"). 몇 곳·몇 장인지처럼 아이콘만으로 모자란 것만 */
  count?: string | number;
  onPress?: () => void;
  /** primary 파랑 / secondary 연파랑 / neutral 회색 / danger 빨강 / text 바탕 없음 */
  variant?: Variant;
  /** sm 36 / md 40 / lg 48 / xl 56(화면 아래 큰 버튼) */
  size?: Size;
  disabled?: boolean;
  /** 서버 응답을 기다리는 동안. 누를 수 없고 돌아가는 표시가 뜬다 */
  loading?: boolean;
  /** 가로로 꽉 채우기 */
  block?: boolean;
  /** 글자 왼쪽 아이콘 */
  leading?: ReactNode;
  /**
   * 글자 굵기. 기본은 굵게(bodyBold). 값 문서가 bodyMedium으로 적은 알약 버튼
   * (S35 [정산 계산], S36 [다시 계산] 등)은 medium. sm 크기는 따로 label 글자를 쓴다
   */
  weight?: 'bold' | 'medium';
  style?: ViewStyle;
};

const BG: Record<Variant, string> = {
  primary: colors.brand.primary,
  secondary: colors.brand.primaryBg,
  neutral: colors.surface.default,
  danger: colors.status.dangerMid,
  text: 'transparent',
};

/** 아이콘만 그릴 때의 아이콘 크기 */
const ICON_SIZE: Record<Size, number> = { sm: 18, md: 20, lg: 22, xl: 24 };

const FG: Record<Variant, string> = {
  primary: colors.text.inverse,
  secondary: colors.brand.primary,
  neutral: colors.text.icon,
  danger: colors.text.inverse,
  text: colors.brand.primary,
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size: sz = 'lg',
  disabled = false,
  loading = false,
  block = false,
  leading,
  icon,
  count,
  weight = 'bold',
  style,
}: ButtonProps) {
  const inactive = disabled || loading;
  const fg = FG[variant];
  const labelStyle =
    sz === 'sm'
      ? typography.label
      : weight === 'medium'
        ? typography.bodyMedium
        : typography.bodyBold;

  const major = (variant === 'primary' || variant === 'danger') && (sz === 'lg' || sz === 'xl');

  // 누르면 살짝 줄었다가 스프링으로 돌아온다(theme/motion). 예전에는 흐려지기만 했다
  const press = usePressScale();

  // 글자와 돌아가는 표시가 서로 바뀔 때 툭 바뀌지 않게 서서히 나타난다. 처음 그릴 때는 움직이지 않는다
  const fade = useState(() => new Animated.Value(1))[0];
  const wasLoading = useRef(loading);
  useEffect(() => {
    if (wasLoading.current === loading) return;
    wasLoading.current = loading;
    if (isReduceMotion()) return;
    fade.setValue(0);
    const showing = Animated.timing(fade, {
      toValue: 1,
      duration: motion.duration.fast,
      easing: motion.easing.out,
      useNativeDriver: motion.native,
    });
    showing.start();
    return () => showing.stop();
  }, [loading, fade]);

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={icon ? (count == null ? label : `${label} ${count}`) : undefined}
      // 작은 동그라미도 누르는 자리는 44가 되게 넓힌다
      hitSlop={icon && size.button[sz] < 44 ? (44 - size.button[sz]) / 2 : undefined}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={() => {
        // 주요 버튼(큰 파랑·빨강)만 가볍게 울린다. 작은 버튼과 보조 버튼은 울리지 않는다
        if (major) haptic.light();
        onPress?.();
      }}
      onPressIn={() => press.onPressIn()}
      onPressOut={press.onPressOut}
      style={[
        styles.base,
        { height: size.button[sz], backgroundColor: BG[variant] },
        sz === 'sm' && styles.sm,
        icon && count == null && !block && { width: size.button[sz], paddingHorizontal: 0 },
        block && styles.block,
        inactive && styles.inactive,
        style,
        { transform: [{ scale: press.scale }] },
      ]}
    >
      <Animated.View style={[styles.content, { opacity: fade }]}>
        {loading ? (
          <Spinner color={fg} />
        ) : icon ? (
          <>
            <Icon name={icon} size={ICON_SIZE[sz]} color={fg} />
            {count == null ? null : <Text style={[labelStyle, { color: fg }]}>{count}</Text>}
          </>
        ) : (
          <>
            {leading}
            <Text style={[labelStyle, { color: fg }]}>{label}</Text>
          </>
        )}
      </Animated.View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[6],
    paddingHorizontal: spacing[20],
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  sm: { paddingHorizontal: spacing[14] },
  block: { alignSelf: 'stretch' },
  // 글자와 아이콘을 한 줄로. 바깥 칸의 간격을 그대로 따른다
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[6],
  },
  inactive: { opacity: 0.4 },
});
