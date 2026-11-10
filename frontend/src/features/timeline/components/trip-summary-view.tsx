import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Icon } from '@/components/ui';
import { colors, layout, spacing, typography } from '@/theme';

import type { SummaryCell } from '../timeline-rules';
import type { TimelinePlace } from '../types';

import { RouteSketch } from './route-sketch';

type TripSummaryViewProps = {
  title: string;
  cells: SummaryCell[];
  note: string | null;
  route: TimelinePlace[];
  coverAssetId: string | null;
};

/** S42 본문: 안내 한 줄 + 요약 카드(지도 그림, 여행 이름, 값 세 칸, 빠진 항목 안내) */
export function TripSummaryView({ title, cells, note, route, coverAssetId }: TripSummaryViewProps) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: spacing[32] + insets.bottom }]}
    >
      <Text style={[typography.title1, styles.text]}>여행 요약</Text>
      <View style={styles.info}>
        <Icon name="info" size={16} color={colors.text.default} />
        <Text style={[typography.caption, styles.text]}>공개한 항목만 들어가요</Text>
      </View>
      <Card rounded="xxl" style={styles.card}>
        <RouteSketch places={route} coverAssetId={coverAssetId} />
        <Text style={[typography.title1, styles.text]} numberOfLines={2}>
          {title}
        </Text>
        <View style={styles.cells}>
          {cells.map((cell) => (
            <View
              key={cell.label}
              style={styles.cell}
              accessible
              accessibilityLabel={`${cell.label} ${cell.value ?? '미입력'}`}
            >
              <Text style={[typography.caption, styles.icon]}>{cell.label}</Text>
              {cell.value ? (
                <Text style={[typography.bodyBold, styles.text]} numberOfLines={1}>
                  {cell.value}
                </Text>
              ) : (
                <Text style={[typography.bodyMedium, styles.sub]}>미입력</Text>
              )}
            </View>
          ))}
        </View>
        {note ? <Text style={[typography.caption, styles.icon]}>{note}</Text> : null}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[16],
    gap: spacing[14],
  },
  info: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  card: { padding: spacing[20], gap: spacing[18] },
  cells: { flexDirection: 'row', justifyContent: 'space-between' },
  // 피그마는 칸마다 98 고정. 좁은 기기에서 넘치지 않게 세 칸이 나눠 갖는다
  cell: { flex: 1, maxWidth: 98, gap: spacing[2] },
  text: { color: colors.text.default },
  icon: { color: colors.text.icon },
  sub: { color: colors.text.sub },
});
