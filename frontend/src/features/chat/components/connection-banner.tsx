import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/ui';
import { realtime, useConnectionState, useShowDisconnected } from '@/realtime';
import { colors, layout, radius, spacing, typography } from '@/theme';

type ViewProps = {
  /** 인증 문제로 멈춘 상태. [다시 시도]를 보인다 */
  stopped: boolean;
  onRetry?: () => void;
  /** 놓인 자리의 여백. 안내가 없을 때는 자리도 차지하지 않게 바깥이 아니라 카드에 준다 */
  style?: StyleProp<ViewStyle>;
};

/**
 * 끊김 안내 카드(피그마 S46 연결 끊김 201-32522). 표시만 한다. /dev/chats에서도 그대로 쓴다.
 * 피그마의 구름 아이콘은 공통 아이콘에 없어 경고 아이콘으로 대신한다
 */
export function ConnectionBannerView({ stopped, onRetry, style }: ViewProps) {
  return (
    <View style={[styles.card, style]} accessibilityRole="alert">
      <View style={styles.iconCircle}>
        <Icon name="alert" size={22} color={colors.status.danger} />
      </View>
      <View style={styles.texts}>
        <Text style={[typography.bodyBold, styles.title]}>연결이 끊겼어요</Text>
        <Text style={[typography.caption, styles.body]}>
          {stopped
            ? '다시 연결하지 못했어요. 다시 시도해 주세요'
            : '다시 연결하는 중이에요. 연결되면 새 메시지를 불러와요'}
        </Text>
      </View>
      {stopped && onRetry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="다시 연결"
          onPress={onRetry}
          hitSlop={spacing[8]}
          style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
        >
          <Icon name="refresh" size={22} color={colors.status.danger} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** 연결 상태를 읽어 끊긴 지 3초가 지났을 때만 보인다(FR-020) */
export function ConnectionBanner({ style }: { style?: StyleProp<ViewStyle> }) {
  const show = useShowDisconnected();
  const state = useConnectionState();
  if (!show) return null;
  return (
    <ConnectionBannerView
      stopped={state.kind === 'stopped'}
      onRetry={realtime.resume}
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[18],
    padding: spacing[20],
    borderRadius: radius.xl,
    backgroundColor: colors.status.dangerBg,
  },
  iconCircle: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    borderRadius: layout.minTouchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.white,
  },
  texts: { flex: 1, gap: spacing[2] },
  title: { color: colors.text.default },
  body: { color: colors.text.icon },
  retry: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
});
