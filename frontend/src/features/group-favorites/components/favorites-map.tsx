import { useRef } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { MapMarker, MapView, type MapViewRef } from '@/components/map';
import { EasyPager } from '@/components/ui/easy-pager';
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
  /** 투표 후보를 고르는 중이면 고른 장소들. 아래 카드에도 체크 상자를 보인다 */
  picked?: Set<string> | null;
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
 * S20 지도 보기(Figma 201-9521). 핀은 담은 사람 첫 글자 묶음과 겹친 수.
 * 아래에는 장소 카드가 늘 떠 있고 옆으로 밀어 한 장씩 넘긴다. 넘기면 그 장소의 핀이 강조되고 지도가 그곳으로 옮겨 간다.
 * 핀을 누르면 그 장소의 카드로 넘어간다. 공통 지도의 MapMarker(S20 얼굴 묶음 + 겹친 수 모양)를 쓴다
 */
export function FavoritesMap({ items, members, selectedId, onSelect, onOpen, picked }: Props) {
  const { width } = useWindowDimensions();
  const map = useRef<MapViewRef>(null);
  const region = regionOf(items);
  // 고른 장소가 없으면 첫 카드가 보인다
  const index = Math.max(
    0,
    items.findIndex((i) => i.place.id === selectedId),
  );
  const shownId = items[index]?.place.id ?? null;
  const show = (next: number) => {
    const item = items[next];
    if (!item) return;
    onSelect(item.place.id);
    if (hasCoord(item)) {
      map.current?.animateCameraTo?.({
        latitude: item.place.latitude,
        longitude: item.place.longitude,
        duration: 400,
      });
    }
  };
  return (
    <View style={styles.wrap}>
      <MapView ref={map} style={styles.map} {...(region ? { initialRegion: region } : {})}>
        {items.filter(hasCoord).map((i) => (
          <MapMarker
            key={i.place.id}
            latitude={i.place.latitude}
            longitude={i.place.longitude}
            initials={saverNames(i, members).map((n) => n.trim().charAt(0))}
            count={i.savedCount >= 2 ? i.savedCount : undefined}
            countTone="badge"
            highlighted={i.place.id === shownId}
            accessibilityLabel={`${i.place.name}, ${i.savedCount}명이 담았어요`}
            onPress={() => onSelect(i.place.id)}
          />
        ))}
      </MapView>
      <EasyPager step={width} count={items.length} page={index} onPage={show} style={styles.cards}>
        {items.map((item) => (
          <View key={item.place.id} style={[styles.page, { width }]}>
            <View style={styles.card}>
              <PlaceRow
                item={item}
                members={members}
                onPress={onOpen}
                selecting={picked != null}
                selected={picked?.has(item.place.id) ?? false}
              />
            </View>
          </View>
        ))}
      </EasyPager>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.map.sea },
  map: { flex: 1 },
  // 카드 줄은 지도 아래쪽에 뜬다. 그림자가 잘리지 않게 위아래로 조금 비운다
  cards: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingVertical: spacing[12] },
  // 한 쪽에 카드 한 장. 화면 여백만 남기고 가로를 채운다
  page: { paddingHorizontal: layout.screenPaddingX },
  card: {
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
