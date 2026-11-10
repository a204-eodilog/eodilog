import { Image } from 'expo-image';
import { useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { Icon } from '@/components/ui';
import { assetSource } from '@/lib/asset-image';
import { colors, radius, spacing } from '@/theme';

import { sketchPoints } from '../timeline-rules';
import type { TimelinePlace } from '../types';

const HEIGHT = 200;
const EMPTY_HEIGHT = 120;
const PAD = 28;
const COVER = 64;

/**
 * S42 지도 그림. 지도 공통 부품(A)에 경로 선이 아직 없어 값 문서가 허락한 "정적 그림"으로 그린다:
 * 장소를 비율대로 놓고 차례로 잇는다. 왼쪽 아래에 대표 사진 64를 겹친다.
 * 장소가 없으면 높이 120 회색 칸 가운데 지도 아이콘
 */
export function RouteSketch({
  places,
  coverAssetId,
}: {
  places: TimelinePlace[];
  coverAssetId: string | null;
}) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const cover = coverAssetId
    ? assetSource(`/api/v1/assets/${encodeURIComponent(coverAssetId)}/download`)
    : null;

  if (places.length === 0) {
    return (
      <View style={[styles.box, styles.empty]} accessibilityLabel="경로를 그릴 장소가 없어요">
        <Icon name="map" size={28} color={colors.text.muted} />
      </View>
    );
  }

  const points = width > 0 ? sketchPoints(places, width, HEIGHT, PAD) : [];
  return (
    <View
      style={[styles.box, styles.map]}
      onLayout={onLayout}
      accessible
      accessibilityLabel={`${places.map((p) => p.name).join(', ')} 경로`}
    >
      {width > 0 ? (
        <Svg width={width} height={HEIGHT}>
          {points.length > 1 ? (
            <Polyline
              points={points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={colors.brand.primary}
              strokeWidth={3}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray="6 6"
            />
          ) : null}
          {points.map((p, i) => (
            <Circle
              key={p.key}
              cx={p.x}
              cy={p.y}
              r={i === 0 || i === points.length - 1 ? 7 : 5}
              fill={colors.surface.white}
              stroke={colors.brand.primary}
              strokeWidth={3}
            />
          ))}
        </Svg>
      ) : null}
      {coverAssetId ? (
        <View style={styles.cover}>
          {cover ? (
            <Image source={cover} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <Icon name="image" size={22} color={colors.text.muted} />
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: '100%', borderRadius: radius.lg, overflow: 'hidden' },
  empty: {
    height: EMPTY_HEIGHT,
    backgroundColor: colors.line.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  map: { height: HEIGHT, backgroundColor: colors.map.seaCenter },
  cover: {
    position: 'absolute',
    left: spacing[12],
    bottom: spacing[12],
    width: COVER,
    height: COVER,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.surface.white,
    backgroundColor: colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
