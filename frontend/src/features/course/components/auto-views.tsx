import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Icon, type IconName } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, radius, spacing, typography } from '@/theme';

import type { AutoFailure } from '../hooks/use-auto-course';

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

const FAIL_TITLE: Record<AutoFailure, string> = {
  noDates: '여행 기간이 없어요',
  noPlaces: '모은 장소가 없어요',
  tooMany: '모은 장소가 너무 많아요',
  conflict: '코스가 바뀌었어요',
  revoked: '추천을 받을 수 없어요',
  failed: '코스를 만들지 못했어요',
};

/** 설명 문장 대신 까닭을 보이는 아이콘 */
const FAIL_ICON: Record<AutoFailure, IconName> = {
  noDates: 'calendar',
  noPlaces: 'map-pin',
  tooMany: 'list',
  conflict: 'people',
  revoked: 'lock',
  failed: 'alert',
};

/** 다시 해도 같은 실패. 다시 시도를 두지 않는다 */
const FINAL: ReadonlySet<AutoFailure> = new Set(['noDates', 'noPlaces', 'tooMany', 'revoked']);

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
  /**
   * 실패 까닭. noDates·noPlaces·tooMany·revoked는 다시 해도 같아 다시 시도 없이 까닭을 알린다.
   * conflict면 최신 코스로 다시 짠다고 알린다
   */
  reason?: AutoFailure;
  /** 초안의 재추천이 실패했으면 직접 만들기 대신 고치던 코스로 돌아간다 */
  backToDraft?: boolean;
}) {
  return (
    <View style={styles.center}>
      <View style={styles.badge}>
        <Icon name={FAIL_ICON[reason]} size={28} color={colors.text.icon} />
      </View>
      <Text style={[typography.title1, styles.title]}>{FAIL_TITLE[reason]}</Text>
      {FINAL.has(reason) ? null : (
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
      <PressableScale style={styles.manual} onPress={onManual} accessibilityRole="button">
        <Icon name={backToDraft ? 'back' : 'pencil'} size={18} color={colors.text.icon} />
        <Text style={[typography.bodyMedium, styles.manualText]}>
          {backToDraft ? '고치던 코스로 돌아가기' : '직접 만들기'}
        </Text>
      </PressableScale>
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
