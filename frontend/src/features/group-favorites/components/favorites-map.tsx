import { StyleSheet, View } from 'react-native';

import { MapMarker, MapView } from '@/components/map';
import { colors, layout, radius, spacing } from '@/theme';

import { saverNames } from '../group-rules';
import type { SavedPlace } from '../types';

import { PlaceRow } from './place-row';

type Props = {
  items: SavedPlace[];
  members: readonly { id: string; name: string; me?: boolean }[];
  selectedId: string | null;
  onSelect(placeId: string | null): void;
  onOpen(item: SavedPlace): void;
};

/** 위도·경도가 둘 다 숫자인 장소만 지도에 놓는다 */
const hasCoord = (i: SavedPlace) =>
  Number.isFinite(i.place.latitude) && Number.isFinite(i.place.longitude);

/** 장소들을 감싸는 범위. 없으면 한국 전체 */
function regionOf(items: SavedPlace[]) {
  const pts = items.filter(hasCoord).map((i) => i.place);
  if (pts.length === 0) return undefined;
  const lats = pts.map((p) => p.latitude);
  const lngs = pts.map((p) => p.longitude);
  const pad = 0.02;
  const minLat = Math.min(...lats) - pad;
  const minLng = Math.min(...lngs) - pad;
  return {
    latitude: minLat,
    longitude: minLng,
    latitudeDelta: Math.max(...lats) + pad - minLat,
    longitudeDelta: Math.max(...lngs) + pad - minLng,
  };
}

/**
 * S20 지도 보기(Figma 201-9521). 핀은 담은 사람 첫 글자 묶음과 겹친 수, 누르면 아래에 장소 카드.
 * 공통 지도의 MapMarker(S20 얼굴 묶음 + 겹친 수 모양)를 쓴다.
 */
export function FavoritesMap({ items, members, selectedId, onSelect, onOpen }: Props) {
  const region = regionOf(items);
  const selected = items.find((i) => i.place.id === selectedId) ?? null;
  return (
    <View style={styles.wrap}>
      <MapView style={styles.map} {...(region ? { initialRegion: region } : {})}>
        {items.filter(hasCoord).map((i) => (
          <MapMarker
            key={i.place.id}
            latitude={i.place.latitude}
            longitude={i.place.longitude}
            initials={saverNames(i, members).map((n) => n.trim().charAt(0))}
            count={i.savedCount >= 2 ? i.savedCount : undefined}
            countTone="badge"
            highlighted={i.place.id === selectedId}
            accessibilityLabel={`${i.place.name}, ${i.savedCount}명이 담았어요`}
            onPress={() => onSelect(i.place.id)}
          />
        ))}
      </MapView>
      {selected ? (
        <View style={styles.card}>
          <PlaceRow item={selected} members={members} onPress={onOpen} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.map.sea },
  map: { flex: 1 },
  card: {
    position: 'absolute',
    left: layout.screenPaddingX,
    right: layout.screenPaddingX,
    bottom: spacing[12],
    paddingHorizontal: spacing[14],
    borderRadius: radius.lg,
    backgroundColor: colors.surface.white,
    shadowColor: colors.text.default,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
