import { StyleSheet, View } from 'react-native';

import { MapLine, MapMarker, MapView } from '@/components/map';
import { colors, radius } from '@/theme';

import { routeLines, routeRegion } from '../route-rules';
import type { FeedDay } from '../types';

const HEIGHT = 180;

/**
 * S07 경로(앱). 네이버 지도 위에 장소 번호 핀을 찍고 같은 날끼리 선으로 잇는다(1일차 실선, 2일차부터 점선).
 * 화면을 위아래로 넘기는 중이라 지도는 움직이지 않게 고정하고, 모든 장소가 들어오게 처음 범위를 맞춘다.
 * 서버가 장소 사이 길(geometry)을 아직 주지 않아 곧은 선으로 잇는다.
 * 웹 미리보기는 route-map.web.tsx(통계청 경계 SVG 그림)가 대신 그려진다
 */
export function RouteMap({ days }: { days: readonly FeedDay[] }) {
  const stops = days.flatMap((d) => d.stops);
  const region = routeRegion(stops.map((s) => s.point));
  if (!region) return null;
  return (
    <View style={styles.box} accessibilityLabel={`경로, 장소 ${stops.length}곳`}>
      <MapView initialRegion={region} isScrollGesturesEnabled={false} isZoomGesturesEnabled={false}>
        {routeLines(days).map((line) => (
          <MapLine key={line.day} coords={line.coords} color={line.color} dashed={line.dashed} />
        ))}
        {stops.map((s) => (
          <MapMarker
            key={s.itemId}
            latitude={s.point.latitude}
            longitude={s.point.longitude}
            label={String(s.number)}
            dot="brand"
            accessibilityLabel={`${s.number}. ${s.name}`}
          />
        ))}
      </MapView>
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
});
