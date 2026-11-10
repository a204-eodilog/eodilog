import type { LatLng } from './korea';

/** 지도 처음 범위. 왼쪽 아래 꼭짓점 + 폭(라이브러리 initialRegion 모양) */
export type MapRegion = LatLng & { latitudeDelta: number; longitudeDelta: number };

/** 지도 칸 크기(px) */
export type MapBox = { width: number; height: number };

/**
 * 점들이 모두 들어오는 범위. 가장자리 핀이 잘리지 않게 사방에 pad(비율)만큼 여유를 준다.
 * minDelta(위도)보다 좁게 확대하지 않는다. 점이 없으면 null
 */
export function fitRegion(
  points: readonly LatLng[],
  minDelta: number,
  pad = 0.25,
): MapRegion | null {
  if (points.length === 0) return null;
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const cos = Math.cos((midLat * Math.PI) / 180);
  const dLat = Math.max(Math.max(...lats) - Math.min(...lats), minDelta);
  const dLng = Math.max(Math.max(...lngs) - Math.min(...lngs), minDelta / cos);
  const midLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  const latitudeDelta = dLat * (1 + pad * 2);
  const longitudeDelta = dLng * (1 + pad * 2);
  return {
    latitude: midLat - latitudeDelta / 2,
    longitude: midLng - longitudeDelta / 2,
    latitudeDelta,
    longitudeDelta,
  };
}

/**
 * 화면에서 minPx보다 가까운 핀끼리 묶어, 묶음 가운데를 중심으로 둥글게 벌려 놓은 좌표(순서는 그대로).
 * 지도는 고정이라 확대해서 떼어 볼 수 없어서, 번호가 서로 가리지 않게 핀만 조금 옮긴다(선은 실제 좌표).
 * 지도는 범위 전체가 들어오게 맞추므로 1px당 도(위도 기준)는 가로·세로 중 큰 쪽이다
 */
export function spreadMarkers<P extends LatLng>(
  points: readonly P[],
  region: MapRegion,
  box: MapBox,
  minPx = 30,
): P[] {
  if (points.length < 2 || box.width <= 0 || box.height <= 0) return [...points];
  const cos = Math.cos(((region.latitude + region.latitudeDelta / 2) * Math.PI) / 180);
  const degPerPx = Math.max(
    region.latitudeDelta / box.height,
    (region.longitudeDelta * cos) / box.width,
  );
  const xy = points.map((p) => ({ x: (p.longitude * cos) / degPerPx, y: p.latitude / degPerPx }));
  const near = (a: number, b: number) => Math.hypot(xy[a].x - xy[b].x, xy[a].y - xy[b].y) < minPx;

  const group = new Array<number>(points.length).fill(-1);
  let groups = 0;
  points.forEach((_, i) => {
    if (group[i] >= 0) return;
    const queue = [i];
    group[i] = groups;
    while (queue.length > 0) {
      const a = queue.pop()!;
      points.forEach((__, b) => {
        if (group[b] < 0 && near(a, b)) {
          group[b] = groups;
          queue.push(b);
        }
      });
    }
    groups += 1;
  });

  const out = [...points];
  for (let g = 0; g < groups; g += 1) {
    const members = points.map((_, i) => i).filter((i) => group[i] === g);
    if (members.length < 2) continue;
    const cx = members.reduce((s, i) => s + xy[i].x, 0) / members.length;
    const cy = members.reduce((s, i) => s + xy[i].y, 0) / members.length;
    // 이웃한 핀 사이가 minPx가 되는 반지름. 첫 핀은 위(12시)부터 시계 방향
    const r = members.length === 2 ? minPx / 2 : minPx / 2 / Math.sin(Math.PI / members.length);
    members.forEach((i, k) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * k) / members.length;
      const x = cx + r * Math.cos(angle);
      const y = cy - r * Math.sin(angle);
      out[i] = { ...points[i], latitude: y * degPerPx, longitude: (x * degPerPx) / cos };
    });
  }
  return out;
}

/**
 * 점선 조각. 라이브러리(2.9.1) 선 부품이 pattern 값을 지도에 넘기지 않아(받기만 하고 버림)
 * 선을 짧은 조각 여러 개로 나눠 점선처럼 그린다. 칠한 길이는 선 전체 범위 대각선의 1/28, 빈 길이는 그 0.75배
 */
export function dashSegments(coords: readonly LatLng[], parts = 28): LatLng[][] {
  if (coords.length < 2) return [];
  const lats = coords.map((p) => p.latitude);
  const lngs = coords.map((p) => p.longitude);
  const cos = Math.cos((((Math.min(...lats) + Math.max(...lats)) / 2) * Math.PI) / 180);
  const diag = Math.hypot(
    Math.max(...lats) - Math.min(...lats),
    (Math.max(...lngs) - Math.min(...lngs)) * cos,
  );
  if (diag === 0) return [];
  const dash = diag / parts;
  const gap = dash * 0.75;
  const at = (a: LatLng, b: LatLng, t: number): LatLng => ({
    latitude: a.latitude + (b.latitude - a.latitude) * t,
    longitude: a.longitude + (b.longitude - a.longitude) * t,
  });
  const out: LatLng[][] = [];
  // 지금 칠하는 중인지와 이번 칸에서 남은 길이(위도 기준 도)
  let drawing = true;
  let left = dash;
  let current: LatLng[] = [coords[0]];
  for (let i = 1; i < coords.length; i += 1) {
    const a = coords[i - 1];
    const b = coords[i];
    const len = Math.hypot(b.latitude - a.latitude, (b.longitude - a.longitude) * cos);
    let done = 0;
    while (len - done > left) {
      done += left;
      const p = at(a, b, done / len);
      if (drawing) {
        current.push(p);
        out.push(current);
      } else {
        current = [p];
      }
      drawing = !drawing;
      left = drawing ? dash : gap;
    }
    left -= len - done;
    if (drawing) current.push(b);
  }
  if (drawing && current.length > 1) out.push(current);
  return out;
}
