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
 * 화면에서 minPx보다 가까운 핀끼리 서로 밀어 내 번호가 겹치지 않게 한 좌표(순서는 그대로).
 * 지도는 고정이라 확대해서 떼어 볼 수 없어서, 번호가 서로 가리지 않게 핀만 조금 옮긴다(선은 실제 좌표).
 * 가까운 두 핀을 반씩 떼어 놓기를 여러 번 되풀이하고, 어느 핀도 제자리에서 maxMovePx보다 멀리 가지 않는다.
 * 예전에는 가까운 핀을 한 묶음으로 모아 원 위에 놓아, 빽빽한 도심(시청역 화장실 20곳)이 실제 위치와
 * 상관없는 큰 원이 되었다(2026-11-16 공기계). 너무 빽빽해 상한 안에서 다 떼어 놓을 수 없으면 일부는 가깝게 남는다.
 * 지도는 범위 전체가 들어오게 맞추므로 1px당 도(위도 기준)는 가로·세로 중 큰 쪽이다
 */
export function spreadMarkers<P extends LatLng>(
  points: readonly P[],
  region: MapRegion,
  box: MapBox,
  minPx = 30,
  maxMovePx = minPx * 2,
): P[] {
  if (points.length < 2 || box.width <= 0 || box.height <= 0) return [...points];
  const cos = Math.cos(((region.latitude + region.latitudeDelta / 2) * Math.PI) / 180);
  const degPerPx = Math.max(
    region.latitudeDelta / box.height,
    (region.longitudeDelta * cos) / box.width,
  );
  const home = points.map((p) => ({ x: (p.longitude * cos) / degPerPx, y: p.latitude / degPerPx }));
  const pos = home.map((p) => ({ ...p }));
  // 처음부터 다른 핀과 겹친 핀만 움직인다. 떨어져 있던 핀은 밀려온 핀이 닿아도 제자리에 둔다
  const crowded = home.map((a, i) =>
    home.some((b, j) => j !== i && Math.hypot(a.x - b.x, a.y - b.y) < minPx),
  );
  const moved = new Array<boolean>(points.length).fill(false);

  for (let round = 0; round < 80; round += 1) {
    let pushed = false;
    for (let i = 0; i < pos.length; i += 1) {
      for (let j = i + 1; j < pos.length; j += 1) {
        let dx = pos[j].x - pos[i].x;
        let dy = pos[j].y - pos[i].y;
        let d = Math.hypot(dx, dy);
        if (d >= minPx || (!crowded[i] && !crowded[j])) continue;
        if (d < 1e-6) {
          // 같은 자리면 방향이 없다. 번호마다 다른 방향(황금각)으로 뗀다
          const angle = j * 2.399963;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          d = 1;
        }
        const gap = minPx - Math.hypot(pos[j].x - pos[i].x, pos[j].y - pos[i].y);
        // 둘 다 움직일 수 있으면 반씩, 한쪽만 겹쳤던 핀이면 그 핀만 민다
        const shareI = crowded[i] ? (crowded[j] ? 0.5 : 1) : 0;
        const shareJ = 1 - shareI;
        const ux = dx / d;
        const uy = dy / d;
        pos[i].x -= ux * gap * shareI;
        pos[i].y -= uy * gap * shareI;
        pos[j].x += ux * gap * shareJ;
        pos[j].y += uy * gap * shareJ;
        if (shareI > 0) moved[i] = true;
        if (shareJ > 0) moved[j] = true;
        pushed = true;
      }
    }
    // 제자리에서 너무 멀어진 핀은 상한까지 끌어온다
    pos.forEach((p, i) => {
      const dx = p.x - home[i].x;
      const dy = p.y - home[i].y;
      const d = Math.hypot(dx, dy);
      if (d > maxMovePx) {
        p.x = home[i].x + (dx / d) * maxMovePx;
        p.y = home[i].y + (dy / d) * maxMovePx;
      }
    });
    if (!pushed) break;
  }

  return points.map((p, i) =>
    moved[i] ? { ...p, latitude: pos[i].y * degPerPx, longitude: (pos[i].x * degPerPx) / cos } : p,
  );
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
