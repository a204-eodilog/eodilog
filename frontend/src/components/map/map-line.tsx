import { NaverMapPolylineOverlay } from '@mj-studio/react-native-naver-map';

import type { LatLng } from './korea';
import { dashSegments } from './map-spread';

export type MapLineProps = {
  /** 잇는 점. 두 개 이상일 때만 그린다 */
  coords: readonly LatLng[];
  color: string;
  /** 선 굵기(px). 기본 4 */
  width?: number;
  /** 점선 */
  dashed?: boolean;
};

const plain = (c: LatLng) => ({ latitude: c.latitude, longitude: c.longitude });

/**
 * 지도 위 선. 장소끼리 이은 경로(S07)에 쓴다. MapView의 children으로 넣는다.
 * 점선은 라이브러리가 pattern을 넘기지 않아 짧은 선 조각으로 나눠 그린다(dashSegments)
 */
export function MapLine({ coords, color, width = 4, dashed = false }: MapLineProps) {
  if (coords.length < 2) return null;
  if (dashed) {
    return (
      <>
        {dashSegments(coords).map((part, i) => (
          <NaverMapPolylineOverlay
            key={i}
            coords={part.map(plain)}
            color={color}
            width={width}
            capType="Round"
            joinType="Round"
          />
        ))}
      </>
    );
  }
  return (
    <NaverMapPolylineOverlay
      coords={coords.map(plain)}
      color={color}
      width={width}
      capType="Round"
      joinType="Round"
    />
  );
}
