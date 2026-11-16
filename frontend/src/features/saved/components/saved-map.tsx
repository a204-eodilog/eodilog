import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { MapMarker, MapView, type MapViewRef } from '@/components/map';
import { EasyPager } from '@/components/ui/easy-pager';
import { layout } from '@/theme';

import { cityGroups, regionFor, regionForPlace, type SavedItem } from '../saved-rules';

import { MapPlaceCard } from './map-place-card';

type SavedMapProps = {
  items: SavedItem[];
  onOpen: (item: SavedItem) => void;
  /** 카드 아래와 탭 바 사이 높이. 지도 로고(NAVER)가 카드 아래에 보이게 띄운다 */
  bottomInset: number;
};

/**
 * S10 지도 보기. 처음엔 첫 카드의 장소로 확대해 그 핀을 보인다. 저장한 곳이 없으면 한국 전체를 보인다.
 * 지역 묶음 마커를 누르면 그 지역으로 확대해 장소 핀과 아래 카드가 그 지역 것으로 바뀐다.
 * 카드를 넘기면 지도가 그 장소로 확대되어 따라가고 해당 핀을 강조한다. 지역을 고르지 않았어도 따라간다.
 * 지도는 공통 MapView(A, 웹 미리보기는 회색 대체 화면)
 */
export function SavedMap({ items, onOpen, bottomInset }: SavedMapProps) {
  const { width } = useWindowDimensions();
  const map = useRef<MapViewRef>(null);
  const groups = useMemo(() => cityGroups(items), [items]);
  const [city, setCity] = useState<string | null>(null);
  const [focused, setFocused] = useState(0);
  // 지도가 카드의 장소를 따라가는 중. 지역을 고르지 않았을 때도 그 장소 핀을 보인다.
  // 처음부터 첫 카드를 따라간다. 카드가 없으면 보일 핀도 없다
  const [following, setFollowing] = useState(true);

  // 처음 범위는 첫 카드의 장소. 지도는 처음 값만 쓰므로 한 번만 정한다. 카드가 없으면 공통 지도의 한국 전체
  const first = items[0];
  const [initialRegion] = useState(() => (first ? regionForPlace(first) : null));
  // 사용자가 지도를 직접 움직였는지(지역 고르기, 카드 넘기기). 그 뒤에는 목록이 바뀌어도 지도를 옮기지 않는다
  const touched = useRef(false);
  const startedAt = useRef(first?.key);
  useEffect(() => {
    // 화면이 뜬 뒤에 목록이 도착했거나 첫 카드가 바뀌었으면 그 장소로 옮긴다
    if (touched.current || !first || startedAt.current === first.key) return;
    startedAt.current = first.key;
    map.current?.animateRegionTo?.(regionForPlace(first));
  }, [first]);

  const shown = city ? (groups.find((g) => g.city === city)?.items ?? []) : items;

  const openCity = (name: string) => {
    touched.current = true;
    setCity(name);
    setFocused(0);
    setFollowing(false);
    const region = regionFor(groups.find((g) => g.city === name)?.items ?? []);
    if (region) map.current?.animateRegionTo?.(region);
  };

  /** 카드를 넘겼다. 그 장소가 카드 위에 오도록 지도를 확대해 옮긴다 */
  const focusCard = (index: number) => {
    setFocused(index);
    const item = shown[index];
    if (!item) return;
    touched.current = true;
    setFollowing(true);
    map.current?.animateRegionTo?.(regionForPlace(item));
  };

  // 지역을 골랐으면 그 지역 장소 핀을 모두, 아니면 카드가 가리키는 장소 핀 하나만 보인다
  const focusedItem = shown[focused];
  const pins = city ? shown : following && focusedItem ? [focusedItem] : [];

  return (
    <View style={styles.wrap}>
      <MapView ref={map} {...(initialRegion ? { initialRegion } : {})}>
        {groups.map((g) => (
          <MapMarker
            key={`city-${g.city}`}
            latitude={g.latitude}
            longitude={g.longitude}
            label={g.city}
            count={g.items.length}
            countIcon="bookmark"
            countTone="brandDark"
            dot="brand"
            highlighted={g.city === city}
            accessibilityLabel={`${g.city}, 저장 ${g.items.length}곳`}
            onPress={() => openCity(g.city)}
          />
        ))}
        {pins.map((item) => (
          <MapMarker
            key={item.key}
            latitude={item.latitude}
            longitude={item.longitude}
            label={item.name}
            dot="brand"
            highlighted={item === focusedItem}
            zIndex={item === focusedItem ? 2 : 1}
            accessibilityLabel={item.name}
            onPress={() => onOpen(item)}
          />
        ))}
      </MapView>

      {/* 조금만 밀어도 한 장씩, 늘 같은 빠르기로 넘어간다(easy-pager). 지역을 바꾸면 첫 카드로 돌아간다 */}
      <EasyPager
        step={width}
        count={shown.length}
        onPage={focusCard}
        resetKey={city}
        style={[styles.cards, { bottom: bottomInset }]}
      >
        {shown.map((item) => (
          <View key={item.key} style={[styles.page, { width }]}>
            <MapPlaceCard item={item} onPress={() => onOpen(item)} />
          </View>
        ))}
      </EasyPager>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  cards: { position: 'absolute', left: 0, right: 0, flexGrow: 0 },
  // 한 쪽에 카드 한 장. 카드는 화면 여백만 남기고 가로를 채운다
  page: { paddingHorizontal: layout.screenPaddingX },
});
