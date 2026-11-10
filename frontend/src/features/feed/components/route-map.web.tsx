import type { FeedDay } from '../types';

import { RouteSketch } from './route-sketch';

/** 웹 미리보기에는 네이버 지도가 없어 통계청 경계 SVG 그림으로 경로를 보인다(앱은 route-map.tsx) */
export function RouteMap({ days }: { days: readonly FeedDay[] }) {
  return <RouteSketch days={days} />;
}
