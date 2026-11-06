import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MapMarker, MapView } from '@/components/map';
import { AvatarGroup, Header, Icon } from '@/components/ui';
import { withIga } from '@/lib/korean';
import { colors, layout, radius, spacing, typography } from '@/theme';

import {
  FACILITY_RADIUS_M,
  FACILITY_TYPES,
  type FacilityRow,
  type FacilityType,
} from '../facility';

export type FacilitiesViewProps = {
  tripTitle: string | null;
  members: readonly string[];
  base: { name: string; latitude: number; longitude: number } | null;
  type: FacilityType;
  state: 'loading' | 'error' | 'ready';
  rows: readonly FacilityRow[];
  onType: (type: FacilityType) => void;
  onChangeBase: () => void;
  onDirections: (row: FacilityRow) => void;
  onRetry: () => void;
};

/** 반경 2km가 화면에 들어오는 지도 범위(왼쪽 아래 꼭짓점 + 폭). 위도 1도 ≈ 111km */
function regionAround(lat: number, lng: number) {
  const dLat = (FACILITY_RADIUS_M * 2.2) / 111_000;
  const dLng = dLat / Math.cos((lat * Math.PI) / 180);
  return {
    latitude: lat - dLat / 2,
    longitude: lng - dLng / 2,
    latitudeDelta: dLat,
    longitudeDelta: dLng,
  };
}

/**
 * S28 주변 편의시설(WD-FR-18). S25 여행 중에서 들어온다. 기준 장소 둘레 2km 안의 시설을 유형별로 보인다.
 * 지도는 네이버 지도라 웹 미리보기에서는 회색 상자로 보인다
 */
export function FacilitiesView(props: FacilitiesViewProps) {
  const label = FACILITY_TYPES.find((t) => t.key === props.type)?.label ?? '시설';
  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
      <Header
        title="주변 편의시설"
        subtitle={props.tripTitle ?? undefined}
        subtitleIcon={props.tripTitle ? 'trip' : undefined}
        right={
          props.members.length > 0 ? (
            <AvatarGroup people={props.members.map((name) => ({ name }))} max={3} />
          ) : undefined
        }
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.baseRow}>
          <Pressable
            onPress={props.onChangeBase}
            style={({ pressed }) => [styles.base, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`기준 장소 ${props.base?.name ?? '없음'}, 바꾸기`}
          >
            <Icon name="map-pin" size={16} color={colors.text.icon} />
            <Text style={styles.baseLabel}>기준</Text>
            <Text style={styles.baseName} numberOfLines={1}>
              {props.base?.name ?? '장소를 골라 주세요'}
            </Text>
            <Text style={styles.baseArrow}>↓</Text>
          </Pressable>
          <Text style={styles.radius}>{FACILITY_RADIUS_M / 1000}km 안</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          style={styles.chipsScroll}
        >
          {FACILITY_TYPES.map((t) => {
            const on = t.key === props.type;
            return (
              <Pressable
                key={t.key}
                onPress={() => props.onType(t.key)}
                style={[styles.chip, on && styles.chipOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.map}>
          {props.base ? (
            <MapView initialRegion={regionAround(props.base.latitude, props.base.longitude)}>
              <MapMarker
                latitude={props.base.latitude}
                longitude={props.base.longitude}
                label={props.base.name}
                highlighted
                zIndex={10}
              />
              {props.rows.map((r) => (
                <MapMarker
                  key={r.id}
                  latitude={r.latitude}
                  longitude={r.longitude}
                  label={String(r.number)}
                  onPress={() => props.onDirections(r)}
                />
              ))}
            </MapView>
          ) : null}
        </View>

        {props.state === 'loading' ? (
          <ActivityIndicator color={colors.brand.primary} style={styles.loading} />
        ) : props.state === 'error' ? (
          <View style={styles.note}>
            <Icon name="alert" size={22} color={colors.text.icon} />
            <Text style={styles.noteTitle}>{label} 정보를 불러오지 못했어요</Text>
            <Text style={styles.noteDesc}>잠시 뒤 다시 시도해 주세요</Text>
            <Pressable onPress={props.onRetry} style={styles.retry} accessibilityRole="button">
              <Text style={styles.retryText}>다시 시도</Text>
            </Pressable>
          </View>
        ) : props.rows.length === 0 ? (
          <View style={styles.note}>
            <Icon name="search" size={22} color={colors.text.icon} />
            <Text style={styles.noteTitle}>
              {FACILITY_RADIUS_M / 1000}km 안에 {withIga(label)} 없어요
            </Text>
            <Text style={styles.noteDesc}>다른 유형을 고르거나 기준 장소를 바꿔 보세요</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {props.rows.map((r) => (
              <View key={r.id} style={styles.row}>
                <View style={styles.number}>
                  <Text style={styles.numberText}>{r.number}</Text>
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.name} numberOfLines={1}>
                    {r.name}
                  </Text>
                  <View style={styles.meta}>
                    {r.walk ? (
                      <>
                        <Icon name="walk" size={14} color={colors.text.icon} />
                        <Text style={styles.metaText}>{r.walk}</Text>
                      </>
                    ) : null}
                    {r.status ? (
                      <>
                        <Icon name="check" size={14} color={colors.status.success} />
                        <Text style={styles.ok} numberOfLines={1}>
                          {r.status}
                        </Text>
                      </>
                    ) : (
                      <>
                        <Icon name="info" size={14} color={colors.text.icon} />
                        <Text style={styles.metaText} numberOfLines={1}>
                          운영 여부를 확인하지 못했어요
                        </Text>
                      </>
                    )}
                  </View>
                </View>
                <Pressable
                  onPress={() => props.onDirections(r)}
                  style={({ pressed }) => [styles.go, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`${r.name} 길찾기`}
                >
                  <Icon name="send" size={18} color={colors.text.default} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  pressed: { opacity: 0.7 },
  content: { paddingBottom: spacing[32], gap: spacing[16] },
  baseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[12],
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[8],
  },
  base: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
    height: 40,
    paddingHorizontal: spacing[14],
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
  },
  baseLabel: { ...typography.caption, color: colors.text.sub },
  baseName: { ...typography.bodyBold, color: colors.text.default, flexShrink: 1 },
  baseArrow: { ...typography.body, color: colors.text.icon },
  radius: { ...typography.caption, color: colors.text.sub },
  chipsScroll: { flexGrow: 0 },
  chips: { gap: spacing[8], paddingHorizontal: layout.screenPaddingX },
  chip: {
    height: 40,
    paddingHorizontal: spacing[16],
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.brand.primaryLight },
  chipText: { ...typography.bodyMedium, color: colors.text.strong },
  chipTextOn: { color: colors.brand.primaryDark },
  map: {
    height: 200,
    marginHorizontal: layout.screenPaddingX,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface.default,
  },
  loading: { marginVertical: spacing[24] },
  note: {
    alignItems: 'center',
    gap: spacing[6],
    paddingVertical: spacing[24],
    paddingHorizontal: layout.screenPaddingX,
  },
  noteTitle: { ...typography.bodyBold, color: colors.text.default, textAlign: 'center' },
  noteDesc: { ...typography.caption, color: colors.text.sub, textAlign: 'center' },
  retry: {
    marginTop: spacing[8],
    height: 36,
    paddingHorizontal: spacing[16],
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
  },
  retryText: { ...typography.captionBold, color: colors.text.default },
  list: { paddingHorizontal: layout.screenPaddingX, gap: spacing[4] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
    paddingVertical: spacing[10],
  },
  number: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: { ...typography.captionBold, color: colors.text.inverse },
  rowText: { flex: 1, minWidth: 0, gap: spacing[4] },
  name: { ...typography.bodyBold, color: colors.text.default },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing[4], flexWrap: 'nowrap' },
  metaText: {
    ...typography.caption,
    color: colors.text.sub,
    marginRight: spacing[6],
    flexShrink: 1,
  },
  ok: { ...typography.caption, color: colors.status.success, flexShrink: 1 },
  go: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
