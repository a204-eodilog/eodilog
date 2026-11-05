import type { Region } from '@mj-studio/react-native-naver-map';

/**
 * 한국 전체가 한 화면에 들어오는 범위(제주·울릉 포함). 홈·마이페이지처럼 처음에 나라 전체를 보여 줄 때 쓴다.
 * 위도·경도는 왼쪽 아래 꼭짓점이고, delta만큼 오른쪽 위로 넓어진다(라이브러리 Region 규칙).
 */
export const KOREA_REGION: Region = {
  latitude: 33.0,
  longitude: 124.6,
  latitudeDelta: 5.7,
  longitudeDelta: 6.6,
};

/** 좌표 한 점. 서버는 위도·경도를 따로 준다(Region.latitude/longitude) */
export type LatLng = { latitude: number; longitude: number };
