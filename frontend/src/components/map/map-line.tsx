import { NaverMapPathOverlay } from '@mj-studio/react-native-naver-map';

import { colors } from '@/theme';

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

/** 흰 테두리. 옅은 파랑 선(2일차)이 바닷가에서 바다 색에 묻히지 않게 둘레를 두른다 */
const OUTLINE = 2;

/**
 * 지도 위 선. 장소끼리 이은 경로(S07)에 쓴다. MapView의 children으로 넣는다.
 * 흰 테두리를 둘러야 해서 PathOverlay를 쓴다. 점선은 라이브러리(2.9.1) 선 부품이 pattern을 넘기지 않아
 * 짧은 선 조각으로 나눠 그린다(dashSegments)
 */
export function MapLine({ coords, color, width = 4, dashed = false }: MapLineProps) {
  if (coords.length < 2) return null;
  const parts = dashed ? dashSegments(coords) : [coords];
  return (
    <>
      {parts.map((part, i) => (
        <NaverMapPathOverlay
          key={i}
          coords={part.map(plain)}
          color={color}
          width={width}
          outlineColor={colors.surface.white}
          outlineWidth={OUTLINE}
        />
      ))}
    </>
  );
}
