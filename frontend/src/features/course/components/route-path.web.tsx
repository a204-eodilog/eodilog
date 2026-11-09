import type { LatLng } from '@/components/map';

/** 웹 미리보기는 지도 대신 회색 상자라 경로선을 그리지 않는다 */
export function RoutePath(_props: { coords: LatLng[]; color: string }) {
  return null;
}
