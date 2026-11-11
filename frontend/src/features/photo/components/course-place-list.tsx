import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Spinner } from '@/components/ui/spinner';

import { Icon } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

import type { CoursePlace } from '../types';

export type CourseDay = { day: number; label: string; stops: CoursePlace[] };

/**
 * 코스 장소 라디오 목록(일차 머리 + 번호 동그라미·이름·라디오). S31 장소 미지정 묶음과 S32 장소 바꾸기에서 같이 쓴다.
 * onSearch를 주면 맨 아래 장소 검색 줄(→ S13)이 붙고, 검색으로 고른 코스 밖 장소(picked)는 코스 목록 아래 한 줄로 보인다
 */
export function CoursePlaceList({
  days,
  state,
  placeId,
  onPlace,
  picked,
  onSearch,
}: {
  days: CourseDay[];
  state: 'loading' | 'error' | 'ready';
  placeId: string | null;
  onPlace: (placeId: string) => void;
  /** 코스에 없는 장소(검색으로 고른 것 또는 지금 연결된 것). 코스에 있으면 무시한다 */
  picked?: { id: string; name: string } | null;
  onSearch?: () => void;
}) {
  const inCourse = days.some((d) => d.stops.some((s) => s.place.id === picked?.id));
  const outside = picked && !inCourse ? picked : null;
  return (
    <View style={styles.wrap}>
      <CourseRows
        days={days}
        state={state}
        placeId={placeId}
        onPlace={onPlace}
        search={!!onSearch}
      />
      {outside ? (
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: outside.id === placeId }}
          accessibilityLabel={`${outside.name}, 코스에 없는 장소`}
          onPress={() => onPlace(outside.id)}
          style={({ pressed }) => [
            styles.row,
            outside.id === placeId && styles.rowOn,
            pressed && styles.pressed,
          ]}
        >
          <View style={[styles.num, outside.id === placeId && styles.numOn]}>
            <Icon name="map-pin" size={14} color={colors.text.inverse} />
          </View>
          <Text style={[typography.body, styles.text, styles.flex]} numberOfLines={1}>
            {outside.name}
          </Text>
          <View style={[styles.radio, outside.id === placeId && styles.radioOn]}>
            {outside.id === placeId ? (
              <Icon name="check" size={14} color={colors.text.inverse} />
            ) : null}
          </View>
        </Pressable>
      ) : null}
      {onSearch ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="장소 검색, 코스에 없는 곳이면 찾아서 연결해요"
          onPress={onSearch}
          style={({ pressed }) => [styles.search, pressed && styles.pressed]}
        >
          <Icon name="search" size={20} color={colors.text.default} />
          <View style={styles.flex}>
            <Text style={[typography.bodyMedium, styles.text]}>장소 검색</Text>
            <Text style={[typography.caption, styles.sub]}>코스에 없는 곳이면 찾아서 연결해요</Text>
          </View>
          <Icon name="chevron-right" size={16} color={colors.text.icon} />
        </Pressable>
      ) : null}
    </View>
  );
}

function CourseRows({
  days,
  state,
  placeId,
  onPlace,
  search,
}: {
  days: CourseDay[];
  state: 'loading' | 'error' | 'ready';
  placeId: string | null;
  onPlace: (placeId: string) => void;
  search: boolean;
}) {
  if (state === 'loading') return <Spinner color={colors.brand.primary} />;
  if (days.length === 0) {
    return (
      <Text style={[typography.body, styles.sub]}>
        {state === 'error'
          ? '코스를 불러오지 못했어요'
          : search
            ? '코스에 장소가 없어요. 장소 검색으로 찾아 연결해요'
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
  wrap: { gap: spacing[12] },
  list: { gap: spacing[2] },
  // 값 문서 S31 "장소 검색 줄": 회색 바탕, 둥글기 16, 안쪽 16/20, 간격 18
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[18],
    paddingVertical: spacing[16],
    paddingHorizontal: spacing[20],
    borderRadius: radius.lg,
    backgroundColor: colors.surface.default,
  },
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
