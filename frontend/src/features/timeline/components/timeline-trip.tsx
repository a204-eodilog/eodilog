import { StyleSheet, Text, View } from 'react-native';

import { Dot, Icon, Tag } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, spacing, typography } from '@/theme';

import type { PlaceRow, TripTag } from '../timeline-rules';

type TimelineTripProps = {
  title: string;
  /** "11.14 – 11.15". 기간을 안 정했으면 "날짜 미정" */
  period: string;
  tag: TripTag;
  rows: PlaceRow[];
  onOpen: () => void;
};

/** S41 여행 묶음: 머리(누르면 S42) + 장소 줄 */
export function TimelineTrip({ title, period, tag, rows, onOpen }: TimelineTripProps) {
  return (
    <View style={styles.group}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${period}, ${tag.label}, 여행 요약 보기`}
        onPress={onOpen}
        style={({ pressed }) => [styles.head, pressed && styles.pressed]}
      >
        <View style={styles.headTexts}>
          <Text style={[typography.bodyBold, styles.text]} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.headInfo}>
            <View style={styles.period}>
              <Icon name="calendar" size={16} color={colors.text.icon} />
              <Text style={[typography.caption, styles.icon]}>{period}</Text>
            </View>
            <Tag label={tag.label} tone={tag.tone} />
          </View>
        </View>
        <Icon name="chevron-right" size={16} color={colors.text.icon} />
      </PressableScale>
      {rows.length === 0 ? (
        <Text style={[typography.caption, styles.icon]}>아직 담은 장소가 없어요</Text>
      ) : (
        <View style={styles.rows}>
          {rows.map((row) => (
            <View
              key={row.key}
              style={styles.row}
              accessible
              accessibilityLabel={[
                row.day,
                row.name,
                row.sub,
                row.visited ? '다녀옴' : row.planOnly ? '계획만' : '계획',
              ]
                .filter(Boolean)
                .join(', ')}
            >
              <Text style={[typography.captionMedium, styles.icon, styles.day]}>
                {row.day ?? ''}
              </Text>
              <View style={styles.dot}>
                <Dot size={10} color={row.visited ? colors.status.success : colors.gray[300]} />
              </View>
              <View style={styles.rowTexts}>
                <View style={styles.nameLine}>
                  <Text style={[typography.body, styles.text, styles.shrink]} numberOfLines={1}>
                    {row.name}
                  </Text>
                  {row.planOnly ? <Tag label="계획만" small /> : null}
                </View>
                <Text style={[typography.caption, styles.icon]}>{row.sub}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing[8] },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing[10] },
  pressed: { opacity: 0.7 },
  headTexts: { flex: 1, gap: spacing[6] },
  headInfo: { flexDirection: 'row', alignItems: 'center', gap: spacing[10] },
  period: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  rows: { gap: spacing[6] },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[12] },
  day: { width: 44, paddingTop: 2 },
  // 점을 장소 이름 첫 줄 가운데에 맞춘다
  dot: { height: 22, justifyContent: 'center' },
  rowTexts: { flex: 1 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  shrink: { flexShrink: 1 },
  text: { color: colors.text.default },
  icon: { color: colors.text.icon },
});
