import { colors } from '@/theme';

import type { FeedDay } from './types';

type Point = { latitude: number; longitude: number };

/** 일차별 선 색. 1일차 진한 파랑 실선, 2일차부터 옅은 파랑 점선(Figma S07) */
const DAY_COLORS = [colors.brand.primary, colors.brand.primarySoft, colors.brand.primaryDark];

/** 가장 좁게 볼 범위(도). 위도 0.02도 ≈ 2km. 한 곳만 다녀왔어도 둘레가 보이게 한다 */
const MIN_DELTA = 0.02;

/**
 * 모든 장소가 들어오는 지도 범위(왼쪽 아래 꼭짓점 + 폭). 핀 말풍선이 잘리지 않게 위아래·양옆에 여유를 둔다.
 * 위로는 말풍선이 올라가므로 위쪽 여유를 더 준다. 장소가 없으면 null
 */
export function routeRegion(points: readonly Point[]) {
  if (points.length === 0) return null;
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)];
  const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)];
  const dLat = Math.max(maxLat - minLat, MIN_DELTA);
  const dLng = Math.max(maxLng - minLng, MIN_DELTA / Math.cos((minLat * Math.PI) / 180));
  const padLat = dLat * 0.3;
  const padLng = dLng * 0.2;
  return {
    latitude: minLat - padLat,
    longitude: minLng - padLng,
    latitudeDelta: dLat + padLat * 2.5,
    longitudeDelta: dLng + padLng * 2,
  };
}

/** 같은 날 장소끼리 이은 선. 두 곳 이상인 날만 */
export function routeLines(days: readonly FeedDay[]) {
  return days.flatMap((d, i) =>
    d.stops.length < 2
      ? []
      : [
          {
            day: d.day,
            coords: d.stops.map((s) => s.point),
            color: DAY_COLORS[Math.min(i, DAY_COLORS.length - 1)],
            dashed: i > 0,
          },
        ],
  );
}

/** 지도 아래 일차 설명("● 1일차 ● 2일차"). 이틀 이상일 때만. 색은 선 색과 같다 */
export function routeLegend(days: readonly FeedDay[]) {
  if (days.length < 2) return [];
  return days.map((d, i) => ({
    day: d.day,
    color: DAY_COLORS[Math.min(i, DAY_COLORS.length - 1)],
  }));
}
