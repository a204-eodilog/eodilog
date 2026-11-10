import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { type MapBox, MapLine, MapMarker, MapView, spreadMarkers } from '@/components/map';
import { colors, radius, spacing, typography } from '@/theme';

import { routeLegend, routeLines, routeRegion } from '../route-rules';
import type { FeedDay } from '../types';

const HEIGHT = 180;

/**
 * S07 경로(앱). 네이버 지도 위에 장소 번호 핀을 찍고 같은 날끼리 선으로 잇는다(1일차 실선, 2일차부터 점선).
 * 화면을 위아래로 넘기는 중이라 지도는 움직이지 않게 고정하고, 모든 장소가 들어오게 처음 범위를 맞춘다.
 * 이틀 이상이면 왼쪽 아래에 일차 설명(선 색)을 띄운다(웹 그림과 같은 모양).
 * 서버가 장소 사이 길(geometry)을 아직 주지 않아 곧은 선으로 잇는다.
 * 웹 미리보기는 route-map.web.tsx(통계청 경계 SVG 그림)가 대신 그려진다
 */
export function RouteMap({ days }: { days: readonly FeedDay[] }) {
  const [box, setBox] = useState<MapBox | null>(null);
  const stops = days.flatMap((d) => d.stops);
  const region = routeRegion(stops.map((s) => s.point));
  if (!region) return null;
  const legend = routeLegend(days);
  // 가까운 장소 번호가 서로 가리지 않게 핀만 조금 벌린다(선은 실제 좌표)
  const pins = box
    ? spreadMarkers(
        stops.map((s) => s.point),
        region,
        box,
      )
    : stops.map((s) => s.point);
  return (
    <View
      style={styles.box}
      accessibilityLabel={`경로, 장소 ${stops.length}곳`}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (box?.width !== width || box?.height !== height) setBox({ width, height });
      }}
    >
      <MapView initialRegion={region} isScrollGesturesEnabled={false} isZoomGesturesEnabled={false}>
        {routeLines(days).map((line) => (
          <MapLine key={line.day} coords={line.coords} color={line.color} dashed={line.dashed} />
        ))}
        {stops.map((s, i) => (
          <MapMarker
            key={s.itemId}
            latitude={pins[i].latitude}
            longitude={pins[i].longitude}
            zIndex={stops.length - i}
            label={String(s.number)}
            dot="brand"
            accessibilityLabel={`${s.number}. ${s.name}`}
          />
        ))}
      </MapView>
      {legend.length > 0 ? (
        <View style={styles.legend} pointerEvents="none">
          {legend.map((l) => (
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

const styles = StyleSheet.create({
  box: {
    height: HEIGHT,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.map.sea,
  },
  // route-sketch.tsx(웹)와 같은 모양
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
