import { NaverMapMarkerOverlay } from '@mj-studio/react-native-naver-map';

import type { LatLng } from './korea';
import { MAP_DOT, MAP_MARKER_HEIGHT, MapPill, type MapPillProps } from './map-pill';

export type MapMarkerProps = LatLng &
  MapPillProps & {
    /** 접근성·식별용. "강릉, 친구 3명이 다녀갔어요" */
    accessibilityLabel?: string;
    onPress?: () => void;
    /** 겹칠 때 위에 그릴 순서. 강조한 마커를 위로 올릴 때 */
    zIndex?: number;
  };

/**
 * 지도 위 말풍선 마커. 아래 점의 가운데가 좌표에 오도록 앵커를 맞췄다.
 * 모양은 MapPill과 같다. MapView의 children으로 넣는다.
 */
export function MapMarker({ latitude, longitude, onPress, zIndex, ...pill }: MapMarkerProps) {
  return (
    <NaverMapMarkerOverlay
      latitude={latitude}
      longitude={longitude}
      // 점 가운데(아래에서 점 반지름만큼 위)가 좌표에 오게 한다
      anchor={{ x: 0.5, y: 1 - MAP_DOT / 2 / MAP_MARKER_HEIGHT }}
      onTap={onPress}
      zIndex={zIndex}
    >
      <MapPill {...pill} />
    </NaverMapMarkerOverlay>
  );
}
