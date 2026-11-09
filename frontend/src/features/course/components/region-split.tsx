import { StyleSheet, Text, View } from 'react-native';

import { Chip, Icon } from '@/components/ui';
import { colors, spacing, typography } from '@/theme';

type Props = {
  day: number;
  regions: { id: string; name: string }[];
  /** 그 날 고른 지역 */
  value: string;
  onChange(regionId: string): void;
};

/**
 * S23 여러 지역 날짜별로 나누기(Figma 385-2817). 여행지가 두 곳 이상일 때 고른 날의 지역을 고른다.
 * 서버 코스에 지역 칸이 없어 화면에서만 기억한다(가정 Q-6-3).
 */
export function RegionSplit({ day, regions, value, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={[typography.caption, styles.label]}>{day + 1}일차 지역</Text>
        {regions.map((r) => (
          <Chip
            key={r.id}
            label={r.name}
            size="sm"
            selected={r.id === value}
            onPress={() => onChange(r.id)}
          />
        ))}
      </View>
      <View style={styles.info}>
        <Icon name="info" size={14} color={colors.text.sub} />
        <Text style={[typography.caption, styles.infoText]}>
          {/* 지역 이름 받침에 따라 조사가 바뀌지 않게 '모두'로 쓴다 */}
          {regions.map((r) => r.name).join('·')} 모두 정해졌어요. 날짜별로 지역을 골라요
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing[10] },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing[8] },
  label: { color: colors.text.sub, marginRight: spacing[4] },
  info: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  infoText: { color: colors.text.sub, flexShrink: 1 },
});
