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
      <Text style={[typography.title3, styles.greeting]}>
        {nickname ? `${nickname}님, ` : ''}
        {current ? `${current.label}부터 해 볼까요?` : '오늘 코스를 확인해요'}
      </Text>

      {view.steps.map((step, i) => (
        <View key={step.label} style={styles.step}>
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
                  typography.micro,
                  step.state === 'current' ? styles.badgeTextCurrent : styles.badgeText,
                ]}
              >
                {i + 1}
              </Text>
            )}
          </View>
          <Text
            style={[
              typography.bodyMedium,
              step.state === 'upcoming' ? styles.stepUpcoming : styles.stepLabel,
            ]}
          >
            {step.label}
          </Text>
          {step.state === 'current' && view.action ? (
            <Button label={view.action.label} size="sm" onPress={onAction} />
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
  wrap: { gap: spacing[12] },
  greeting: { color: colors.text.default },
  note: { color: colors.text.muted },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing[12], minHeight: 40 },
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
  stepUpcoming: { flex: 1, color: colors.text.muted },
});
