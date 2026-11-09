import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

import type { CoursePlace } from '../types';

export type CourseDay = { day: number; label: string; stops: CoursePlace[] };

/**
 * 코스 장소 라디오 목록(일차 머리 + 번호 동그라미·이름·라디오). S31 장소 미지정 묶음과 S32 장소 바꾸기에서 같이 쓴다
 */
export function CoursePlaceList({
  days,
  state,
  placeId,
  onPlace,
}: {
  days: CourseDay[];
  state: 'loading' | 'error' | 'ready';
  placeId: string | null;
  onPlace: (placeId: string) => void;
}) {
  if (state === 'loading') return <ActivityIndicator color={colors.brand.primary} />;
  if (days.length === 0) {
    return (
      <Text style={[typography.body, styles.sub]}>
        {state === 'error'
          ? '코스를 불러오지 못했어요'
          : '코스에 장소가 없어요. 코스에 장소를 넣은 뒤 연결해요'}
      </Text>
    );
  }
  return (
    <View style={styles.list}>
      {days.map((day) => (
        <View key={day.day} style={styles.list}>
          <Text style={[typography.captionMedium, styles.sub, styles.dayHead]}>{day.label}</Text>
          {day.stops.map((stop, i) => {
            const on = stop.place.id === placeId;
            return (
              <Pressable
                key={stop.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={stop.place.name}
                onPress={() => onPlace(stop.place.id)}
                style={({ pressed }) => [styles.row, on && styles.rowOn, pressed && styles.pressed]}
              >
                <View style={[styles.num, on && styles.numOn]}>
                  <Text style={[typography.captionBold, styles.numText]}>{i + 1}</Text>
                </View>
                <Text style={[typography.body, styles.text, styles.flex]} numberOfLines={1}>
                  {stop.place.name}
                </Text>
                <View style={[styles.radio, on && styles.radioOn]}>
                  {on ? <Icon name="check" size={14} color={colors.text.inverse} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  text: { color: colors.text.default },
  sub: { color: colors.text.icon },
  pressed: { opacity: 0.6 },
  list: { gap: spacing[2] },
  dayHead: { marginTop: spacing[4], marginBottom: spacing[4] },
  row: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[14],
    paddingHorizontal: spacing[12],
    borderRadius: 14,
  },
  rowOn: { backgroundColor: colors.brand.primaryBg },
  num: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.text.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numOn: { backgroundColor: colors.brand.primary },
  numText: { color: colors.text.inverse },
  radio: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.line.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { backgroundColor: colors.brand.primary, borderColor: colors.brand.primary },
});
