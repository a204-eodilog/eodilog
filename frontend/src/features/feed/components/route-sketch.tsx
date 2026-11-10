import { useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { KOREA_MAP, KOREA_MAP_CREDIT, projectLatLng } from '@/lib/korea-map';
import { colors, radius, spacing, typography } from '@/theme';

import type { FeedDay } from '../types';

const HEIGHT = 180;
const PAD = 28;
/**
 * 가장 좁게 볼 범위(지도 좌표, 1 ≈ 0.6km). 시내 안에서만 다닌 여행도 해안선·시군 경계가 보이게 하고,
 * 경계를 단순하게 줄여 둔 지도를 너무 크게 키워 선이 각져 보이지 않게 한다
 */
const MIN_SPAN = 30;
/** 일차별 선 색. 1일차 진한 파랑 실선, 2일차부터 옅은 파랑 점선(Figma S07) */
const DAY_COLORS = [colors.brand.primary, colors.brand.primarySoft, colors.brand.primaryDark];

/**
 * S07 경로(웹 미리보기용). 홈과 같은 시도·시군구 SVG 지도(통계청 경계)를 바탕에 깔고, 장소를 찍어 같은 날끼리 선으로 잇는다.
 * 앱에서는 route-map.tsx가 네이버 지도로 그린다.
 * 장소가 없으면 그리지 않는다(부르는 쪽이 섹션을 숨긴다)
 */
export function RouteSketch({ days }: { days: readonly FeedDay[] }) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const stops = days.flatMap((d) => d.stops);

  // 홈과 같은 시도·시군구 SVG 지도 위에 장소를 찍는다. 장소들을 감싸는 범위를 상자에 맞춰 확대한다
  const map = stops.map((st) => projectLatLng(st.point.latitude, st.point.longitude));
  const xs = map.map((p) => p[0]);
  const ys = map.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const innerW = Math.max(1, width - PAD * 2);
  const innerH = HEIGHT - PAD * 2;
  const k = Math.min(
    innerW / Math.max(maxX - minX, MIN_SPAN),
    innerH / Math.max(maxY - minY, (MIN_SPAN * innerH) / innerW),
  );
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const toScreen = (p: readonly [number, number]) => ({
    x: (p[0] - cx) * k + width / 2,
    y: (p[1] - cy) * k + HEIGHT / 2,
  });
  // 상자에 걸치는 시군구만 그린다(230개를 다 그리지 않게)
  const view = {
    x0: cx - width / 2 / k,
    x1: cx + width / 2 / k,
    y0: cy - HEIGHT / 2 / k,
    y1: cy + HEIGHT / 2 / k,
  };
  const land = KOREA_MAP.sigungu.filter((g) => overlaps(boundsFor(g.code), view));

  const placed = spreadApart(map.map(toScreen), width);

  let index = 0;
  const lines = days.map((d, di) => {
    const pts = d.stops.map(() => placed[index++]);
    return {
      day: d.day,
      color: DAY_COLORS[Math.min(di, DAY_COLORS.length - 1)],
      dashed: di > 0,
      pts,
    };
  });

  return (
    <View
      style={styles.box}
      onLayout={onLayout}
      accessibilityLabel={`경로, 장소 ${stops.length}곳`}
    >
      {width > 0 && stops.length > 0 ? (
        <Svg width={width} height={HEIGHT}>
          {/* 바다 + 땅(시군구). 홈 지도와 같은 색 */}
          <Rect width={width} height={HEIGHT} fill={colors.map.seaMid} />
          <G transform={`translate(${width / 2 - cx * k} ${HEIGHT / 2 - cy * k}) scale(${k})`}>
            {land.map((g) => (
              <Path
                key={g.code}
                d={g.d}
                fill={colors.surface.white}
                stroke={colors.line.default}
                strokeWidth={1 / k}
              />
            ))}
          </G>
          {lines.map((l) =>
            l.pts.length > 1 ? (
              <Path
                key={`line-${l.day}`}
                d={l.pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ')}
                stroke={l.color}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={l.dashed ? '6 6' : undefined}
                fill="none"
              />
            ) : null,
          )}
          {lines.map((l) =>
            l.pts.map((p, i) => {
              const n =
                lines.slice(0, lines.indexOf(l)).reduce((a, x) => a + x.pts.length, 0) + i + 1;
              return (
                <G key={`dot-${l.day}-${i}`}>
                  <Circle cx={p.x} cy={p.y} r={11} fill={colors.surface.white} />
                  <Circle cx={p.x} cy={p.y} r={9} fill={l.color} />
                  <SvgText
                    x={p.x}
                    y={p.y + 4}
                    fontSize={11}
                    fontWeight="700"
                    fill={colors.text.inverse}
                    textAnchor="middle"
                  >
                    {n}
                  </SvgText>
                </G>
              );
            }),
          )}
        </Svg>
      ) : null}
      <Text style={styles.credit} pointerEvents="none">
        {KOREA_MAP_CREDIT}
      </Text>
      {days.length > 1 ? (
        <View style={styles.legend}>
          {lines.map((l) => (
            <View key={`legend-${l.day}`} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: l.color }]} />
              <Text style={styles.legendText}>{l.day}일차</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

type Box = { x0: number; x1: number; y0: number; y1: number };

/** path 좌표(M x y L ...)를 감싸는 상자 */
function boundsOf(d: string): Box {
  const nums = d.match(/-?\d+(\.\d+)?/g) ?? [];
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = Number(nums[i]);
    const y = Number(nums[i + 1]);
    box.x0 = Math.min(box.x0, x);
    box.x1 = Math.max(box.x1, x);
    box.y0 = Math.min(box.y0, y);
    box.y1 = Math.max(box.y1, y);
  }
  return box;
}

// 앱이 켜질 때가 아니라 S07을 처음 그릴 때 한 번만 계산한다
let BOUNDS: Map<string, Box> | null = null;
const boundsFor = (code: string) => {
  BOUNDS ??= new Map(KOREA_MAP.sigungu.map((g) => [g.code, boundsOf(g.d)] as const));
  return BOUNDS.get(code);
};

const overlaps = (a: Box | undefined, v: Box) =>
  !!a && a.x1 >= v.x0 && a.x0 <= v.x1 && a.y1 >= v.y0 && a.y0 <= v.y1;

/** 번호 동그라미 지름보다 가까운 점끼리 조금씩 밀어 겹치지 않게 한다. 대략의 위치·순서는 그대로 */
const MIN_GAP = 26;
function spreadApart(points: { x: number; y: number }[], width: number) {
  const p = points.map((q) => ({ ...q }));
  for (let round = 0; round < 30; round += 1) {
    let moved = false;
    for (let i = 0; i < p.length; i += 1) {
      for (let j = i + 1; j < p.length; j += 1) {
        const dx = p[j].x - p[i].x;
        const dy = p[j].y - p[i].y;
        const d = Math.hypot(dx, dy);
        if (d >= MIN_GAP) continue;
        // 같은 자리면 오른쪽 아래로 벌린다
        const [ux, uy] = d === 0 ? [0.7, 0.7] : [dx / d, dy / d];
        const push = (MIN_GAP - d) / 2;
        p[i].x -= ux * push;
        p[i].y -= uy * push;
        p[j].x += ux * push;
        p[j].y += uy * push;
        moved = true;
      }
    }
    for (const q of p) {
      q.x = Math.min(width - 14, Math.max(14, q.x));
      q.y = Math.min(HEIGHT - 14, Math.max(14, q.y));
    }
    if (!moved) break;
  }
  return p;
}

const styles = StyleSheet.create({
  box: {
    height: HEIGHT,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface.default,
  },
  credit: {
    ...typography.micro,
    fontFamily: typography.caption.fontFamily,
    position: 'absolute',
    right: spacing[10],
    bottom: spacing[6],
    color: colors.text.muted,
  },
  legend: {
    position: 'absolute',
    left: spacing[10],
    bottom: spacing[10],
    flexDirection: 'row',
    gap: spacing[10],
    paddingHorizontal: spacing[10],
    paddingVertical: spacing[4],
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  legendDot: { width: 8, height: 8, borderRadius: radius.full },
  legendText: { ...typography.caption, color: colors.text.strong },
});
