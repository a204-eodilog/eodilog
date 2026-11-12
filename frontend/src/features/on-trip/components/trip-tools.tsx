import { StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, radius, spacing, typography } from '@/theme';

type Tool = { key: string; icon: IconName; label: string; sub: string; onPress(): void };

/**
 * S25 여행 중 도구 세 칸(Figma 201-14252). 날씨 대안, 준비물, 주변 편의시설.
 * 아래 줄은 비 확률, 챙긴 수, "코스 근처".
 */
export function TripTools(props: {
  rainChance: number | null;
  checklist: { total: number; checked: number } | null;
  onWeather(): void;
  onChecklist(): void;
  onAmenities(): void;
}) {
  const tools: Tool[] = [
    {
      key: 'weather',
      icon: 'umbrella',
      label: '날씨 대안',
      sub: props.rainChance !== null ? `비 ${props.rainChance}%` : '날씨 보기',
      onPress: props.onWeather,
    },
    {
      key: 'checklist',
      icon: 'bag',
      label: '준비물',
      sub: props.checklist
        ? `${props.checklist.checked}/${props.checklist.total} 챙김`
        : '목록 보기',
      onPress: props.onChecklist,
    },
    {
      key: 'amenities',
      icon: 'zap',
      label: '주변 편의시설',
      sub: '코스 근처',
      onPress: props.onAmenities,
    },
  ];
  return (
    <View style={styles.grid}>
      {tools.map((t, order) => (
        <PressableScale
          appear={order}
          appearFrom="pop"
          key={t.key}
          style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
          onPress={t.onPress}
          accessibilityRole="button"
          accessibilityLabel={`${t.label}, ${t.sub}`}
        >
          <View style={styles.iconBox}>
            <Icon name={t.icon} size={20} color={colors.text.default} />
          </View>
          <Text style={[typography.captionMedium, styles.label]} numberOfLines={1}>
            {t.label}
          </Text>
          <Text style={[typography.caption, styles.sub]} numberOfLines={1}>
            {t.sub}
          </Text>
        </PressableScale>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: spacing[10] },
  cell: {
    flex: 1,
    alignItems: 'center',
    gap: spacing[8],
    paddingVertical: spacing[16],
    paddingHorizontal: spacing[4],
    borderRadius: radius.xl,
    backgroundColor: colors.surface.default,
  },
  pressed: { opacity: 0.7 },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { color: colors.text.default },
  sub: { color: colors.text.icon },
});
