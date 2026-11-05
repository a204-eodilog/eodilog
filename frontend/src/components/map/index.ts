/**
 * 지도 화면이 같이 쓰는 부품. 지도는 네이버 지도(@mj-studio/react-native-naver-map)이고
 * 웹 미리보기에는 네이티브 지도가 없어 대체 화면(*.web.tsx)이 그려진다.
 *
 * import { MapView, MapMarker, CenterPin } from '@/components/map';
 *
 * 어떻게 보이는지는 개발용 화면 /dev/map에서 본다(지도는 안드로이드 개발 빌드에서).
 */
export { CenterPin } from './center-pin';
export { KOREA_REGION } from './korea';
export type { LatLng } from './korea';
export { MapHint } from './map-hint';
export type { MapHintProps } from './map-hint';
export { MapMarker } from './map-marker';
export type { MapMarkerProps } from './map-marker';
export { MAP_MARKER_HEIGHT, MapPill } from './map-pill';
export type { MapPillProps } from './map-pill';
export { MapView } from './map-view';
export type { MapViewProps, MapViewRef } from './map-view';
