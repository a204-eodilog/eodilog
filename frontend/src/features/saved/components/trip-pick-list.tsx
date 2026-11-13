import { StyleSheet, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

import { Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, radius, spacing, typography } from '@/theme';

export type TripOption = {
  id: string;
  title: string;
  /** "12.26 – 12.27". 기간을 안 정했으면 null */
  period: string | null;
  /** "민준, 지우". 혼자면 빈 문자열 */
  companions: string;
};

type TripPickListProps = {
  trips: TripOption[];
  selectedId: string | null;
  onSelect: (tripId: string) => void;
};

/**
 * 담을 여행 고르기(S08 "담을 여행"과 같은 모양, S14 그룹 즐겨찾기에 추가 시트에서 쓴다).
 * 줄 높이 80, 안쪽 16/20, 둥글기 16, 고른 줄 연파랑, 오른쪽 라디오 22.
 * 여행이 많으면 시트가 화면 밖으로 길어져 [저장]·[추가]를 누를 수 없어서, 세 줄 반 높이까지만 보이고 안에서 넘긴다.
 * 시트(@gorhom/bottom-sheet) 안에서 끌기와 겹치지 않게 gesture-handler의 ScrollView를 쓴다
 */
export function TripPickList({ trips, selectedId, onSelect }: TripPickListProps) {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.list}
      accessibilityRole="radiogroup"
      showsVerticalScrollIndicator={trips.length > VISIBLE_ROWS}
    >
      {trips.map((trip) => {
        const selected = trip.id === selectedId;
        return (
          <PressableScale
            key={trip.id}
            accessibilityRole="radio"
            accessibilityLabel={[trip.title, trip.period, trip.companions]
              .filter(Boolean)
              .join(', ')}
            accessibilityState={{ checked: selected }}
            onPress={() => onSelect(trip.id)}
            style={[styles.row, selected && styles.selected]}
          >
            <View style={styles.texts}>
              <Text style={[typography.bodyBold, styles.title]} numberOfLines={1}>
                {trip.title}
              </Text>
              {trip.period || trip.companions ? (
                <View style={styles.info}>
                  {trip.period ? (
                    <View style={styles.infoItem}>
                      <Icon name="calendar" size={16} color={colors.text.icon} />
                      <Text style={[typography.caption, styles.sub]}>{trip.period}</Text>
                    </View>
                  ) : null}
                  {trip.companions ? (
                    <View style={[styles.infoItem, styles.shrink]}>
                      <Icon name="people" size={16} color={colors.text.icon} />
                      <Text
                        style={[typography.caption, styles.sub, styles.shrink]}
                        numberOfLines={1}
                      >
                        {trip.companions}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
            <View style={[styles.radio, selected && styles.radioOn]}>
              {selected ? <View style={styles.radioDot} /> : null}
            </View>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

/** 이만큼 넘으면 목록 안에서 넘긴다. 반 줄이 걸쳐 보여 더 있다는 걸 알 수 있게 3.5줄 */
const VISIBLE_ROWS = 3;
const ROW_HEIGHT = 80;

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, maxHeight: ROW_HEIGHT * 3.5 + spacing[10] * VISIBLE_ROWS },
  list: { gap: spacing[10] },
  row: {
    minHeight: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
    paddingVertical: spacing[16],
    paddingHorizontal: spacing[20],
    borderRadius: radius.lg,
    backgroundColor: colors.surface.default,
  },
  selected: { backgroundColor: colors.brand.primaryBg },
  texts: { flex: 1, gap: spacing[2] },
  title: { color: colors.text.default },
  info: { flexDirection: 'row', alignItems: 'center', gap: spacing[14] },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  shrink: { flexShrink: 1 },
  sub: { color: colors.text.icon },
  radio: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.gray[300],
    backgroundColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.brand.primary, backgroundColor: colors.brand.primary },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
  },
});
