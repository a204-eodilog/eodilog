import { useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { colors, radius, spacing, typography } from '@/theme';

import type { FeedDay } from '../types';

const HEIGHT = 180;
const PAD = 28;
/** 일차별 선 색. 1일차 진한 파랑 실선, 2일차부터 옅은 파랑 점선(Figma S07) */
const DAY_COLORS = [colors.brand.primary, colors.brand.primarySoft, colors.brand.primaryDark];

/**
 * S07 경로. 네이버 지도 대신 장소 좌표를 상자에 맞춰 찍고 같은 날 장소끼리 선으로 잇는 약식 지도.
 * 위도는 경도보다 1도가 길어 cos(위도)로 가로를 줄여 모양이 눌리지 않게 한다.
 * 장소가 없으면 그리지 않는다(부르는 쪽이 섹션을 숨긴다)
 */
export function RouteSketch({ days }: { days: readonly FeedDay[] }) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const stops = days.flatMap((d) => d.stops);

  const lat0 = stops.reduce((a, s) => a + s.point.latitude, 0) / Math.max(1, stops.length);
  const kx = Math.cos((lat0 * Math.PI) / 180);
  const xs = stops.map((s) => s.point.longitude * kx);
  const ys = stops.map((s) => -s.point.latitude);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const spanX = Math.max(maxX - minX, 1e-4);
  const spanY = Math.max(maxY - minY, 1e-4);
  const scale = Math.min((width - PAD * 2) / spanX, (HEIGHT - PAD * 2) / spanY);
  const offX = (width - spanX * scale) / 2;
  const offY = (HEIGHT - spanY * scale) / 2;
  const placed = spreadApart(
    stops.map((_, i) => ({ x: offX + (xs[i] - minX) * scale, y: offY + (ys[i] - minY) * scale })),
    width,
  );

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
          {/* 바탕의 옅은 길 무늬. 실제 길이 아니라 지도 느낌만 준다 */}
          <Rect width={width} height={HEIGHT} fill={colors.surface.default} />
          <Path
            d={`M${width * 0.62} 0 Q${width * 0.7} ${HEIGHT * 0.5} ${width * 0.82} ${HEIGHT}`}
            stroke={colors.surface.white}
            strokeWidth={10}
            fill="none"
          />
          <Line
            x1={0}
            y1={HEIGHT * 0.62}
            x2={width}
            y2={HEIGHT * 0.58}
            stroke={colors.surface.white}
            strokeWidth={6}
          />
          <Line
            x1={width * 0.18}
            y1={0}
            x2={width * 0.3}
            y2={HEIGHT}
            stroke={colors.surface.white}
            strokeWidth={4}
          />
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
