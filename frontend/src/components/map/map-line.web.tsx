import type { LatLng } from './korea';

export type MapLineProps = {
  coords: readonly LatLng[];
  color: string;
  width?: number;
  dashed?: boolean;
};

/** 웹에는 지도가 없어 선도 그리지 않는다(map-view.web.tsx 대체 화면) */
export function MapLine(_props: MapLineProps) {
  return null;
}
