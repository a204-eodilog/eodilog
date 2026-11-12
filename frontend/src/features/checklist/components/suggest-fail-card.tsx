import { StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
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
  { title: string; body: string; action: string; icon: IconName; badge: IconName }
> = {
  general: {
    title: CHECKLIST_TEXT.suggestFailTitle,
    body: CHECKLIST_TEXT.suggestFailBody,
    action: '다시 시도',
    icon: 'refresh',
    badge: 'alert',
  },
  disabled: {
    title: CHECKLIST_TEXT.disabledTitle,
    body: CHECKLIST_TEXT.disabledBody,
    action: '설정 열기',
    icon: 'settings',
    badge: 'gear',
  },
};

/**
 * 다시 제안 실패 카드(Figma 201-30087). 목록 위에 두고 목록은 그대로 보인다.
 * 글 대신 까닭 아이콘과 버튼만 보이고, 제목과 설명은 화면 읽기 프로그램에만 준다
 */
export function SuggestFailCard({ failure, onAction }: Props) {
  const copy = COPY[failure];
  return (
    <View style={styles.card}>
      <View
        style={styles.badge}
        accessible
        accessibilityRole="alert"
        accessibilityLabel={`${copy.title}. ${copy.body}`}
      >
        <Icon name={copy.badge} size={22} color={colors.text.icon} />
      </View>
      <View style={styles.actionRow}>
        <PressableScale style={styles.action} onPress={onAction} accessibilityRole="button">
          <Icon name={copy.icon} size={16} color={colors.text.default} />
          <Text style={[typography.bodyMedium, styles.actionText]}>{copy.action}</Text>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface.default,
    borderRadius: radius.xl,
    padding: spacing[14],
    gap: spacing[10],
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRow: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end' },
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
