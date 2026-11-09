import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

import { CHECKLIST_TEXT } from '../checklist-rules';
import type { SuggestFailure } from '../hooks/use-suggest-checklist';

type Props = {
  failure: SuggestFailure;
  /** general이면 다시 제안을 요청하고, disabled면 설정을 연다 */
  onAction(): void;
};

const COPY: Record<
  SuggestFailure,
  { title: string; body: string; action: string; icon: IconName }
> = {
  general: {
    title: CHECKLIST_TEXT.suggestFailTitle,
    body: CHECKLIST_TEXT.suggestFailBody,
    action: '다시 시도',
    icon: 'refresh',
  },
  disabled: {
    title: CHECKLIST_TEXT.disabledTitle,
    body: CHECKLIST_TEXT.disabledBody,
    action: '설정 열기',
    icon: 'settings',
  },
};

/** 다시 제안 실패 카드(Figma 201-30087). 목록 위에 두고 목록은 그대로 보인다 */
export function SuggestFailCard({ failure, onAction }: Props) {
  const copy = COPY[failure];
  return (
    <View style={styles.card} accessibilityRole="alert">
      <View style={styles.top}>
        <View style={styles.badge}>
          <Icon name="alert" size={22} color={colors.text.icon} />
        </View>
        <View style={styles.texts}>
          <Text style={[typography.bodyBold, styles.title]}>{copy.title}</Text>
          <Text style={[typography.caption, styles.body]}>{copy.body}</Text>
        </View>
      </View>
      <View style={styles.actionRow}>
        <Pressable style={styles.action} onPress={onAction} accessibilityRole="button">
          <Icon name={copy.icon} size={16} color={colors.text.default} />
          <Text style={[typography.bodyMedium, styles.actionText]}>{copy.action}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface.default,
    borderRadius: radius.xl,
    padding: spacing[18],
    gap: spacing[10],
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing[14] },
  badge: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1, gap: spacing[2] },
  title: { color: colors.text.default },
  body: { color: colors.text.icon },
  actionRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
    height: 36,
    paddingLeft: spacing[12],
    paddingRight: spacing[16],
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
  },
  actionText: { color: colors.text.default },
});
