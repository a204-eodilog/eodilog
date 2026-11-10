import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

import { loadingStep, loadingSteps } from '../recommend-rules';

type Props = {
  /** 이번 작업을 시작한 시각(ms) */
  startedAt: number | null;
  progress: number;
  placeCount: number;
  peopleCount: number;
};

/**
 * S21 생성 중(Figma 201-10044). 전구 원, "추천을 만들고 있어요", 세 단계.
 * 서버가 단계를 주지 않아 흐른 시간으로 넘긴다(recommend-rules loadingStep).
 */
export function RecommendLoading({ startedAt, progress, placeCount, peopleCount }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  const step = loadingStep(startedAt ? now - startedAt : 0, progress);
  const labels = loadingSteps(placeCount, peopleCount);

  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      <View style={styles.halo}>
        <Icon name="bulb" size={32} color={colors.brand.primary} />
      </View>
      <Text style={[typography.title1, styles.title]}>추천을 만들고 있어요</Text>
      <Text style={[typography.body, styles.body]}>보통 10초 안에 끝나요</Text>
      <View style={styles.steps}>
        {labels.map((label, i) => (
          <View key={label} style={styles.step}>
            {i < step ? (
              <View style={styles.done}>
                <Icon name="check" size={16} color={colors.status.success} />
              </View>
            ) : i === step ? (
              <ActivityIndicator size="small" color={colors.brand.primary} style={styles.mark} />
            ) : (
              <View style={styles.mark}>
                <View style={styles.dot} />
              </View>
            )}
            <Text
              style={[
                i === step ? typography.bodyBold : typography.body,
                i < step ? styles.doneText : i === step ? styles.nowText : styles.laterText,
              ]}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[32] + spacing[8],
    paddingBottom: 110,
  },
  halo: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.brand.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 0 12px rgba(42, 114, 229, 0.22)',
  },
  title: { color: colors.text.default, marginTop: spacing[28], textAlign: 'center' },
  body: { color: colors.text.icon, marginTop: spacing[8], textAlign: 'center' },
  steps: { width: '100%', maxWidth: 310, gap: spacing[14], paddingTop: spacing[32] },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing[14] },
  mark: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  done: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    backgroundColor: colors.status.successBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 8, height: 8, borderRadius: radius.xs, backgroundColor: colors.gray[300] },
  doneText: { color: colors.text.icon },
  nowText: { color: colors.text.default },
  laterText: { color: colors.text.sub },
});
