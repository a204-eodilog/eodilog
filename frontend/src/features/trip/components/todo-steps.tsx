import { StyleSheet, Text, View } from 'react-native';

import { Button, Icon } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

import type { TripDetailView } from '../trip-rules';

type Props = {
  nickname: string | null;
  view: TripDetailView;
  onAction: () => void;
  onPublish: () => void;
};

/** S17 '지금 할 일'. 인사 + 단계(완료 ✓ / 지금 / 다음) + 지금 단계 버튼 (결정 F-17) */
export function TodoSteps({ nickname, view, onAction, onPublish }: Props) {
  const current = view.steps.find((s) => s.state === 'current');

  return (
    <View style={styles.wrap}>
      {/* 피그마 S17: 인사 20(이름만 파랑), 단계 줄 위아래 13·아래 선, 지금 단계 버튼 높이 40 */}
      <Text style={[typography.title2, styles.greeting]}>
        {nickname ? <Text style={styles.nickname}>{nickname}</Text> : null}
        {nickname ? '님, ' : ''}
        {view.greeting ?? (current ? `${current.label}부터 해 볼까요?` : '오늘 코스를 확인해요')}
      </Text>

      {view.steps.map((step, i) => (
        <View
          key={step.label}
          style={[styles.step, i < view.steps.length - 1 && styles.stepDivider]}
        >
          <View
            style={[
              styles.badge,
              step.state === 'done' && styles.badgeDone,
              step.state === 'current' && styles.badgeCurrent,
            ]}
          >
            {step.state === 'done' ? (
              <Icon name="check" size={14} color={colors.status.success} />
            ) : (
              <Text
                style={[
                  typography.captionBold,
                  step.state === 'current' ? styles.badgeTextCurrent : styles.badgeText,
                ]}
              >
                {i + 1}
              </Text>
            )}
          </View>
          <Text
            style={[
              step.state === 'current' ? typography.bodyBold : typography.body,
              step.state === 'upcoming'
                ? styles.stepUpcoming
                : step.state === 'done'
                  ? styles.stepDone
                  : styles.stepLabel,
            ]}
          >
            {step.label}
          </Text>
          {step.state === 'current' && view.action ? (
            <Button label={view.action.label} size="md" onPress={onAction} />
          ) : null}
        </View>
      ))}

      {view.note ? <Text style={[typography.body, styles.note]}>{view.note}</Text> : null}
      {view.steps.length === 0 && view.action ? (
        <Button label={view.action.label} block onPress={onAction} />
      ) : null}
      {view.showPublish ? (
        <Button label="피드로 게시" variant="secondary" block onPress={onPublish} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing[14], paddingTop: spacing[4] },
  greeting: { color: colors.text.default },
  nickname: { color: colors.brand.primary },
  note: { color: colors.text.muted },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing[14], paddingVertical: 13 },
  stepDivider: { borderBottomWidth: 1, borderBottomColor: colors.line.default },
  badge: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.default,
  },
  badgeDone: { backgroundColor: colors.status.successBg },
  badgeCurrent: { backgroundColor: colors.brand.primary },
  badgeText: { color: colors.text.muted },
  badgeTextCurrent: { color: colors.text.inverse },
  stepLabel: { flex: 1, color: colors.text.default },
  stepDone: { flex: 1, color: colors.text.sub2 },
  stepUpcoming: { flex: 1, color: colors.text.muted },
});
