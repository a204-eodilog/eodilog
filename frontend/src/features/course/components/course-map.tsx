import { StyleSheet, View } from 'react-native';

import { MapMarker, MapView } from '@/components/map';
import { Tag } from '@/components/ui';
import { colors, spacing } from '@/theme';

import type { DraftItem, DayLeg } from '../course-rules';

import { RoutePath } from './route-path';

export type MapBadge = { label: string; tone: 'saved' | 'draft' | 'editing' | 'warning' };

type Props = {
  items: DraftItem[];
  legs: DayLeg[];
  /** 지도 왼쪽 위 표시(저장됨·추천안·고치는 중)와 그 아래 안내 */
  badges: MapBadge[];
  /** S24는 초록, S23은 파랑 */
  tone: 'saved' | 'draft';
};

const MAP_HEIGHT = 220;

/** 고른 날의 장소를 감싸는 범위. 장소가 없으면 한국 전체 */
function regionOf(items: DraftItem[]) {
  const pts = items.map((i) => i.place).filter((p) => Number.isFinite(p.latitude));
  if (pts.length === 0) return undefined;
  const lats = pts.map((p) => p.latitude);
  const lngs = pts.map((p) => p.longitude);
  const pad = 0.01;
  const minLat = Math.min(...lats) - pad;
  const minLng = Math.min(...lngs) - pad;
  return {
    latitude: minLat,
    longitude: minLng,
    latitudeDelta: Math.max(...lats) + pad - minLat,
    longitudeDelta: Math.max(...lngs) + pad - minLng,
  };
}

const TAG_TONE = {
  saved: 'success',
  draft: 'outline',
  editing: 'neutral',
  warning: 'outline',
} as const;

/** 코스 지도(Figma 201-12879·201-13969 위). 공통 지도에 번호 핀과 경로선을 얹는다 */
export function CourseMap({ items, legs, badges, tone }: Props) {
  const color = tone === 'saved' ? colors.status.success : colors.brand.primary;
  const region = regionOf(items);
  return (
    <View style={styles.wrap}>
      <MapView
        key={items.map((i) => i.key).join('|')}
        style={styles.map}
        {...(region ? { initialRegion: region } : {})}
      >
        {legs.map((l, i) => {
          const coords = (l.info?.geometry?.coordinates ?? []).map(([lng, lat]) => ({
            latitude: lat,
            longitude: lng,
          }));
          return <RoutePath key={`${l.key}-${i}`} coords={coords} color={color} />;
        })}
        {items.map((i, n) => (
          <MapMarker
            key={i.key}
            latitude={i.place.latitude}
            longitude={i.place.longitude}
            label={`${n + 1} ${i.place.name}`}
            accessibilityLabel={`${n + 1}번 ${i.place.name}`}
          />
        ))}
      </MapView>
      <View style={styles.badges} pointerEvents="none">
        {badges.map((b) => (
          <View key={b.label}>
            <Tag
              label={b.label}
              tone={TAG_TONE[b.tone]}
              icon={
                b.tone === 'saved'
                  ? 'check'
                  : b.tone === 'warning'
                    ? 'alert'
                    : b.tone === 'editing'
                      ? 'pencil'
                      : 'map-pin'
              }
              small
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: MAP_HEIGHT, backgroundColor: colors.map.sea },
  map: { flex: 1 },
  badges: { position: 'absolute', top: spacing[12], left: spacing[12], gap: spacing[6] },
});
