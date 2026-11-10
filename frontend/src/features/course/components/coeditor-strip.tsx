import { StyleSheet, Text, View } from 'react-native';

import { Avatar, Icon } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

export type CoEditor = { name: string; imageUrl: string | null };

/** "세은님도…" 또는 "세은님 외 1명도…" */
export function coeditorLabel(editors: readonly CoEditor[]): string {
  const [first, ...rest] = editors;
  if (!first) return '';
  const who = rest.length > 0 ? `${first.name}님 외 ${rest.length}명` : `${first.name}님`;
  return `${who}도 이 코스를 고치고 있어요`;
}

/**
 * 지금 같은 코스를 고치고 있는 동행 줄(Figma 201-13453 일차 탭 아래).
 * 누가 편집 중인지 알려 줄 실시간 정보가 아직 없어 미리보기에서만 쓴다(spec Q-8-5).
 * 편집 중인 동행이 없으면 그리지 않는다.
 */
export function CoeditorStrip({ editors }: { editors: readonly CoEditor[] }) {
  if (editors.length === 0) return null;
  const first = editors[0];
  return (
    <View style={styles.strip} accessibilityRole="text">
      <Avatar name={first.name} imageUrl={first.imageUrl} size="sm" />
      <Text style={[typography.caption, styles.text]} numberOfLines={1}>
        {coeditorLabel(editors)}
      </Text>
      <Icon name="pencil" size={16} color={colors.text.icon} />
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[10],
    paddingHorizontal: spacing[14],
    paddingVertical: spacing[10],
    borderRadius: radius.lg - 2,
    backgroundColor: colors.surface.default,
  },
  text: { flex: 1, color: colors.text.icon },
});
