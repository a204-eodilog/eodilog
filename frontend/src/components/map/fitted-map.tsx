import { type ReactNode, useEffect, useRef, useState } from 'react';

import type { MapRegion } from './map-spread';
import { MapView, type MapViewRef } from './map-view';

/**
 * 보여 줄 범위가 바뀌면 지도를 새로 만들지 않고 카메라만 옮긴다.
 * 범위가 바뀔 때마다 지도를 다시 만들면(key 바꾸기) 새 지도가 준비되기 전에 핀이 빠지면서
 * 안드로이드에서 앱이 죽었다(2026-11-14 공기계: 장소 찾기 후보 묻기 11번 뒤 IndexOutOfBounds).
 * 장소 찾기(S12)와 주변 편의시설(S28, 시설 종류를 바꿀 때)이 같이 쓴다
 */
export function FittedMap({ region, children }: { region: MapRegion | null; children: ReactNode }) {
  const map = useRef<MapViewRef>(null);
  const [initial] = useState(region);
  const latitude = region?.latitude;
  const longitude = region?.longitude;
  const latitudeDelta = region?.latitudeDelta;
  const longitudeDelta = region?.longitudeDelta;
  useEffect(() => {
    if (
      latitude === undefined ||
      longitude === undefined ||
      latitudeDelta === undefined ||
      longitudeDelta === undefined
    )
      return;
    map.current?.animateRegionTo?.({ latitude, longitude, latitudeDelta, longitudeDelta });
  }, [latitude, longitude, latitudeDelta, longitudeDelta]);
  return (
    <MapView ref={map} {...(initial ? { initialRegion: initial } : {})}>
      {children}
    </MapView>
  );
}
