import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Icon } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

import { CheckLine } from './setup-views';

/** 보이는 단계를 넘기는 시각(ms). 서버가 단계를 알려 주지 않아 흐른 시간으로 보인다 */
const STEP_AT = [0, 1500, 4000];

/** S23 자동 추천 생성 중(Figma 201-12610) */
export function AutoLoadingView({ savedCount }: { savedCount: number }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timers = STEP_AT.slice(1).map((ms, i) => setTimeout(() => setStep(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, []);
  const lines = [`모은 장소 ${savedCount}곳 살펴보기`, '날짜별로 나누기', '이동 시간 계산하기'];
  return (
    <View style={styles.center}>
      <View style={[styles.badge, styles.badgeBrand]}>
        <Icon name="route" size={30} color={colors.brand.primary} />
      </View>
      <Text style={[typography.title1, styles.title]}>코스를 짜고 있어요</Text>
      <Text style={[typography.body, styles.body]}>보통 10초 안에 끝나요</Text>
      <View style={styles.steps} accessibilityRole="progressbar">
        {lines.map((text, i) => (
          <CheckLine
            key={text}
            text={text}
            state={i < step ? 'done' : i === step ? 'doing' : 'todo'}
          />
        ))}
      </View>
    </View>
  );
}

/** S23 자동 추천 실패(Figma 201-12684) */
export function AutoFailView({
  onRetry,
  onManual,
  backToDraft = false,
  retrying = false,
  reason = 'failed',
}: {
  onRetry(): void;
  onManual(): void;
  /** 다시 시도 요청을 보내는 중. 화면은 그대로 두고 버튼만 도는 표시 */
  retrying?: boolean;
  /** noPlaces면 다시 해도 같으므로 다시 시도 없이 까닭을 알린다. conflict면 최신 코스로 다시 짠다고 알린다 */
  reason?: 'noPlaces' | 'conflict' | 'failed';
  /** 초안의 재추천이 실패했으면 직접 만들기 대신 고치던 코스로 돌아간다 */
  backToDraft?: boolean;
}) {
  return (
    <View style={styles.center}>
      <View style={styles.badge}>
        <Icon name="alert" size={28} color={colors.text.icon} />
      </View>
      <Text style={[typography.title1, styles.title]}>
        {reason === 'noPlaces' ? '모은 장소가 없어요' : '코스를 만들지 못했어요'}
      </Text>
      <Text style={[typography.body, styles.body]}>
        {reason === 'noPlaces'
          ? '그룹 즐겨찾기에 장소를 모은 뒤 추천받거나 직접 만들어 보세요'
          : reason === 'conflict'
            ? '그 사이 동행이 코스를 바꿨어요. 다시 시도하면 바뀐 코스로 짜요'
            : backToDraft
              ? '다시 시도하거나 고치던 코스로 돌아가요'
              : '다시 시도하거나 직접 만들어 보세요'}
      </Text>
      {reason === 'noPlaces' ? null : (
        <Button
          label="다시 시도"
          size="lg"
          weight="medium"
          leading={<Icon name="refresh" size={20} color={colors.text.inverse} />}
          onPress={onRetry}
          loading={retrying}
          style={styles.button}
        />
      )}
      <Pressable style={styles.manual} onPress={onManual} accessibilityRole="button">
        <Icon name={backToDraft ? 'back' : 'pencil'} size={18} color={colors.text.icon} />
        <Text style={[typography.bodyMedium, styles.manualText]}>
          {backToDraft ? '고치던 코스로 돌아가기' : '직접 만들기'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[32],
    paddingBottom: 110,
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeBrand: { backgroundColor: colors.brand.primaryBg },
  title: { color: colors.text.default, marginTop: spacing[20], textAlign: 'center' },
  body: { color: colors.text.icon, marginTop: spacing[8], textAlign: 'center' },
  steps: { alignSelf: 'stretch', gap: spacing[14], marginTop: spacing[28] },
  button: { alignSelf: 'center', marginTop: spacing[24] },
  manual: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    minHeight: 48,
    paddingHorizontal: spacing[16],
    marginTop: spacing[6],
  },
  manualText: { color: colors.text.icon },
});
