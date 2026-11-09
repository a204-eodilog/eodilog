import { NaverMapPathOverlay } from '@mj-studio/react-native-naver-map';

import type { LatLng } from '@/components/map';

/**
 * 구간 경로선. 서버가 준 지도선(geometry)이 있을 때만 그린다.
 * 경로를 못 구한 구간은 선 없이 핀만 둔다(직선으로 채우지 않는다). MapView의 children으로 넣는다.
 */
export function RoutePath({ coords, color }: { coords: LatLng[]; color: string }) {
  if (coords.length < 2) return null;
  return <NaverMapPathOverlay coords={coords} width={4} color={color} outlineWidth={0} />;
}
