import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { useVoiceTrip } from '../voice-trip-store';

/** 실험: 여행 탭 위 띠. 말로 만든 초안을 정리 중이거나 다 됐으면 보이고, 누르면 초안 화면으로 간다 */
export function VoiceTripBanner() {
  const state = useVoiceTrip();
  if (state.kind === 'idle') return null;
  const text =
    state.kind === 'ready'
      ? '말로 만든 여행 초안이 준비됐어요'
      : state.kind === 'failed'
        ? '말로 만든 여행을 정리하지 못했어요'
        : '말로 만든 여행을 정리하고 있어요';
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${text}. 보기`}
      onPress={() => router.push('/trips/voice-draft')}
      style={styles.wrap}
    >
      <View style={[styles.banner, state.kind === 'failed' && styles.failed]}>
        {state.kind === 'running' || state.kind === 'uploading' ? (
          <ActivityIndicator size="small" color={colors.brand.primary} />
        ) : (
          <Icon
            name={state.kind === 'ready' ? 'mic' : 'alert'}
            size={18}
            color={state.kind === 'ready' ? colors.brand.primary : colors.status.danger}
          />
        )}
        <Text style={[typography.captionBold, styles.text]}>{text}</Text>
        <Text style={[typography.captionBold, styles.link]}>보기</Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: layout.screenPaddingX, paddingBottom: spacing[8] },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[10],
    backgroundColor: colors.brand.primaryBg,
    borderRadius: radius.md,
    paddingHorizontal: spacing[14],
    paddingVertical: spacing[12],
  },
  failed: { backgroundColor: colors.status.dangerBg },
  text: { flex: 1, color: colors.text.default },
  link: { color: colors.brand.primary },
});
