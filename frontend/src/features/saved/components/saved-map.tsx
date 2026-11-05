import { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { MapMarker, MapView, type MapViewRef } from '@/components/map';
import { layout, spacing } from '@/theme';

import { cityGroups, type SavedItem } from '../saved-rules';

import { MAP_CARD_WIDTH, MapPlaceCard } from './map-place-card';

/** 지역 하나를 눌렀을 때 보여 줄 범위(도·광역시 안 한 도시 정도) */
const CITY_DELTA = 0.12;
const CARD_GAP = spacing[10];

type SavedMapProps = {
  items: SavedItem[];
  onOpen: (item: SavedItem) => void;
  /** 아래 떠 있는 [+]·탭 바에 카드가 가리지 않게 띄울 높이 */
  bottomInset: number;
};

/**
 * S10 지도 보기. 처음엔 지역 묶음 마커만 보이고, 누르면 그 지역으로 확대해 장소 핀과 아래 카드가 그 지역 것으로 바뀐다.
 * 카드를 넘기면 해당 핀을 강조한다. 지도는 공통 MapView(A, 웹 미리보기는 회색 대체 화면)
 */
export function SavedMap({ items, onOpen, bottomInset }: SavedMapProps) {
  const map = useRef<MapViewRef>(null);
  const groups = useMemo(() => cityGroups(items), [items]);
  const [city, setCity] = useState<string | null>(null);
  const [focused, setFocused] = useState(0);

  const shown = city ? (groups.find((g) => g.city === city)?.items ?? []) : items;

  const openCity = (name: string, latitude: number, longitude: number) => {
    setCity(name);
    setFocused(0);
    map.current?.animateRegionTo?.({
      latitude: latitude - CITY_DELTA / 2,
      longitude: longitude - CITY_DELTA / 2,
      latitudeDelta: CITY_DELTA,
      longitudeDelta: CITY_DELTA,
    });
  };

  return (
    <View style={styles.wrap}>
      <MapView ref={map}>
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
            onPress={() => openCity(g.city, g.latitude, g.longitude)}
          />
        ))}
        {city
          ? shown.map((item, i) => (
              <MapMarker
                key={item.key}
                latitude={item.latitude}
                longitude={item.longitude}
                label={item.name}
                dot="brand"
                highlighted={i === focused}
                zIndex={i === focused ? 2 : 1}
                accessibilityLabel={item.name}
                onPress={() => onOpen(item)}
              />
            ))
          : null}
      </MapView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={MAP_CARD_WIDTH + CARD_GAP}
        decelerationRate="fast"
        onMomentumScrollEnd={(e) =>
          setFocused(Math.round(e.nativeEvent.contentOffset.x / (MAP_CARD_WIDTH + CARD_GAP)))
        }
        style={[styles.cards, { bottom: bottomInset }]}
        contentContainerStyle={styles.cardRow}
      >
        {shown.map((item, i) => (
          <MapPlaceCard
            key={item.key}
            item={item}
            highlighted={city !== null && i === focused}
            onPress={() => onOpen(item)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  cards: { position: 'absolute', left: 0, right: 0, flexGrow: 0 },
  cardRow: { paddingHorizontal: layout.screenPaddingX, gap: CARD_GAP },
});
