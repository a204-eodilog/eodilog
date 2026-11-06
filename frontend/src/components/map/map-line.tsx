import { NaverMapPolylineOverlay } from '@mj-studio/react-native-naver-map';

import type { LatLng } from './korea';

export type MapLineProps = {
  /** 잇는 점. 두 개 이상일 때만 그린다 */
  coords: readonly LatLng[];
  color: string;
  /** 선 굵기(px). 기본 4 */
  width?: number;
  /** 점선. 칠한 길이·빈 길이(px) */
  dashed?: boolean;
};

/** 지도 위 선. 장소끼리 이은 경로(S07)에 쓴다. MapView의 children으로 넣는다 */
export function MapLine({ coords, color, width = 4, dashed = false }: MapLineProps) {
  if (coords.length < 2) return null;
  return (
    <NaverMapPolylineOverlay
      coords={coords.map((c) => ({ latitude: c.latitude, longitude: c.longitude }))}
      color={color}
      width={width}
      pattern={dashed ? [10, 8] : undefined}
      capType="Round"
      joinType="Round"
    />
  );
}
