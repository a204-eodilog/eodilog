import {
  NaverMapView,
  type NaverMapViewProps,
  type NaverMapViewRef,
} from '@mj-studio/react-native-naver-map';
import { forwardRef } from 'react';
import { StyleSheet } from 'react-native';

import { KOREA_REGION } from './korea';

export type MapViewProps = NaverMapViewProps;
export type MapViewRef = NaverMapViewRef;

/**
 * 앱 공통 지도. 네이버 지도에 어디로그 기본값을 얹었다.
 * - 처음 범위는 한국 전체, 한국 밖으로는 못 나간다
 * - 나침반·축척·확대 버튼·내 위치 버튼은 숨긴다(화면마다 필요한 버튼을 직접 올린다)
 * - 글자는 한국어, 건물만 켜고 교통·자전거 같은 겹은 끈다
 * 다른 값은 NaverMapView 속성을 그대로 넘기면 덮어쓴다. 마커는 children으로 MapMarker를 넣는다.
 *
 * 지도 키(NAVER_MAP_CLIENT_ID)가 없으면 지도 바탕이 비어 보이지만 마커와 화면은 그대로 뜬다.
 * 웹 미리보기는 map-view.web.tsx의 대체 화면이 대신 그려진다.
 */
export const MapView = forwardRef<MapViewRef, MapViewProps>(function MapView(
  { style, children, ...props },
  ref,
) {
  return (
    <NaverMapView
      ref={ref}
      style={[styles.map, style]}
      initialRegion={KOREA_REGION}
      isExtentBoundedInKorea
      isShowCompass={false}
      isShowScaleBar={false}
      isShowZoomControls={false}
      isShowLocationButton={false}
      isTiltGesturesEnabled={false}
      isRotateGesturesEnabled={false}
      locale="ko"
      logoAlign="BottomLeft"
      {...props}
    >
      {children}
    </NaverMapView>
  );
});

const styles = StyleSheet.create({
  map: { flex: 1 },
});
