import { StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

export type MapHintProps = {
  /** "지도를 움직여 위치를 맞춰 주세요" */
  text: string;
  icon?: IconName;
};

/** 지도 위 짙은 안내 띠(S13 지도에서 고르기). 높이 32, 가운데 정렬은 부모가 정한다 */
export function MapHint({ text, icon = 'map' }: MapHintProps) {
  return (
    <View style={styles.hint} accessibilityLiveRegion="polite">
      <Icon name={icon} size={16} color={colors.text.inverse} />
      <Text style={[typography.captionMedium, styles.text]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: {
    alignSelf: 'center',
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
    paddingHorizontal: spacing[12],
    borderRadius: radius.full,
    backgroundColor: colors.text.strong,
  },
  text: { color: colors.text.inverse },
});
