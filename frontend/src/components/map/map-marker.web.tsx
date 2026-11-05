import type { LatLng } from './korea';
import type { MapPillProps } from './map-pill';

export type MapMarkerProps = LatLng &
  MapPillProps & { accessibilityLabel?: string; onPress?: () => void; zIndex?: number };

/** 웹에는 지도가 없어 마커도 그리지 않는다(map-view.web.tsx 대체 화면) */
export function MapMarker(_props: MapMarkerProps) {
  return null;
}
