import { NaverMapMarkerOverlay } from '@mj-studio/react-native-naver-map';
import { useState } from 'react';
import { View } from 'react-native';

import type { LatLng } from './korea';
import { MAP_DOT_AREA, MAP_MARKER_HEIGHT, MapPill, type MapPillProps } from './map-pill';

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
 *
 * 라이브러리(2.9.1) "Custom React View" 규칙: 마커에 width·height를 주고, 맨 위 자식 View에
 * collapsable={false}와 생김새가 바뀌는 값을 담은 key를 준다. 말풍선 너비는 글자에 따라 달라
 * 한 번 그려 재고(onLayout) 그 값으로 다시 그린다. 재기 전에는 너비 없이 그린다.
 * 많이 만들면 성능에 영향이 크다고 되어 있어 마커가 많은 화면(S05·S10)은 마커 묶기와 같이 본다.
 */
export function MapMarker({ latitude, longitude, onPress, zIndex, ...pill }: MapMarkerProps) {
  const [width, setWidth] = useState<number>();
  const look = [
    pill.label,
    pill.initials?.join(''),
    pill.count,
    pill.countIcon,
    pill.countTone,
    pill.highlighted,
    pill.dot,
    pill.ring,
    width,
  ].join('/');

  return (
    <NaverMapMarkerOverlay
      latitude={latitude}
      longitude={longitude}
      width={width}
      height={MAP_MARKER_HEIGHT}
      // 점 칸 가운데(아래에서 점 칸 절반만큼 위)가 좌표에 오게 한다
      anchor={{ x: 0.5, y: 1 - MAP_DOT_AREA / 2 / MAP_MARKER_HEIGHT }}
      onTap={onPress}
      zIndex={zIndex}
    >
      <View
        key={look}
        collapsable={false}
        onLayout={(e) => setWidth(Math.ceil(e.nativeEvent.layout.width))}
        style={width ? { width, height: MAP_MARKER_HEIGHT } : undefined}
      >
        <MapPill {...pill} />
      </View>
    </NaverMapMarkerOverlay>
  );
}
