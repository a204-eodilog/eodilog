import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import {
  GestureDetector,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { KOREA_MAP, KOREA_MAP_CREDIT, MAINLAND_BOUNDS, type MapPoint } from '@/lib/korea-map';
import { colors, spacing, typography } from '@/theme';

export type KoreaMapPin = {
  key: string;
  /** 지도 좌표. 지역 핀은 findMapRegion(code).point, 위경도는 projectLatLng */
  point: MapPoint;
  /** bottom: 핀 아래 끝이 점에 닿음(말풍선), center: 가운데가 점 */
  anchor?: 'bottom' | 'center';
  children: ReactNode;
};

export type KoreaMapProps = {
  /** 지역 코드 → 칠할 색. 시군구 코드가 먼저, 없으면 그 시도 코드 */
  fills?: Readonly<Record<string, string>>;
  pins?: readonly KoreaMapPin[];
  /** 이 배율을 넘으면 onDetailChange(true). 홈은 시군 사진 핀으로 바꾼다 */
  detailScale?: number;
  onDetailChange?: (detail: boolean) => void;
  /** 처음 볼 곳. 없으면 전국 */
  initialFocus?: { point: MapPoint; scale: number };
  maxScale?: number;
  /** 지도 위를 덮는 것(위 버튼·아래 시트)의 높이. 처음 맞출 때 이 영역을 피한다 */
  inset?: { top?: number; bottom?: number };
  /** 출처 표기 위치를 아래에서 띄울 때(아래 시트가 덮는 화면) */
  creditBottom?: number;
  style?: ViewStyle;
};

const MIN_SCALE = 1;
/** 핀 내용이 꺾이지 않고 놓일 너비. 이보다 넓은 핀은 없다 */
const PIN_ROOM = 280;
const LAND = colors.surface.white;

/**
 * 시도·시군구 SVG 물든 지도. 네이버 지도가 아니라 경계(통계청 SGIS)를 직접 그린다.
 * 두 손가락 확대·축소, 한 손가락 이동, 두 번 누르면 확대. 핀은 확대해도 크기가 그대로다.
 * S05 홈·S37 마이페이지·S40·S07·S42가 같이 쓴다. 화면별 값(색 단계, 핀 모양)은 부르는 쪽이 정한다.
 */
export function KoreaMap({
  fills = {},
  pins = [],
  detailScale = 2.2,
  onDetailChange,
  initialFocus,
  maxScale = 8,
  inset,
  creditBottom = spacing[8],
  style,
}: KoreaMapProps) {
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!box || box.width !== width || box.height !== height) setBox({ width, height });
  };

  return (
    <View style={[styles.box, style]} onLayout={onLayout}>
      {box ? (
        <MapCanvas
          box={box}
          fills={fills}
          pins={pins}
          detailScale={detailScale}
          onDetailChange={onDetailChange}
          initialFocus={initialFocus}
          maxScale={maxScale}
          insetTop={inset?.top ?? 0}
          insetBottom={inset?.bottom ?? 0}
        />
      ) : null}
      <Text style={[styles.credit, { bottom: creditBottom }]} pointerEvents="none">
        {KOREA_MAP_CREDIT}
      </Text>
    </View>
  );
}

type CanvasProps = Required<Pick<KoreaMapProps, 'fills' | 'pins' | 'detailScale' | 'maxScale'>> &
  Pick<KoreaMapProps, 'onDetailChange' | 'initialFocus'> & {
    box: { width: number; height: number };
    insetTop: number;
    insetBottom: number;
  };

function MapCanvas({
  box,
  fills,
  pins,
  detailScale,
  onDetailChange,
  initialFocus,
  maxScale,
  insetTop,
  insetBottom,
}: CanvasProps) {
  // 본토 + 제주가 덮이지 않는 영역에 들어오는 크기(배율 1)와 그 가운데
  const b = MAINLAND_BOUNDS;
  const visibleH = Math.max(1, box.height - insetTop - insetBottom);
  const fit = Math.min(box.width / (b.x1 - b.x0), visibleH / (b.y1 - b.y0)) * 0.92;
  const baseW = KOREA_MAP.width * fit;
  const baseH = KOREA_MAP.height * fit;
  const centerY = insetTop + visibleH / 2;

  const start = useMemo(() => {
    const s = initialFocus?.scale ?? 1;
    const [cx, cy] = initialFocus?.point ?? [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
    return { s, x: box.width / 2 - cx * fit * s, y: centerY - cy * fit * s };
    // 처음 한 번만 정한다. 이후에는 손가락으로 움직인 위치를 유지한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box.width, box.height]);

  const scale = useSharedValue(start.s);
  const tx = useSharedValue(start.x);
  const ty = useSharedValue(start.y);

  // 지도가 화면 밖으로 나가 사라지지 않게, 지도의 가운데 40%가 늘 화면 안에 걸치도록 묶는다
  const clamp = (s: number, x: number, y: number) => {
    'worklet';
    const w = baseW * s;
    const h = baseH * s;
    return {
      x: Math.min(box.width * 0.5, Math.max(box.width * 0.5 - w, x)),
      y: Math.min(box.height * 0.5, Math.max(box.height * 0.5 - h, y)),
    };
  };

  const zoomAt = (fx: number, fy: number, ratio: number) => {
    'worklet';
    const next = Math.min(maxScale, Math.max(MIN_SCALE, scale.value * ratio));
    const r = next / scale.value;
    const c = clamp(next, fx - (fx - tx.value) * r, fy - (fy - ty.value) * r);
    scale.value = next;
    tx.value = c.x;
    ty.value = c.y;
  };

  const pinch = usePinchGesture({
    onUpdate: (e) => {
      'worklet';
      zoomAt(e.focalX, e.focalY, e.scaleChange);
    },
  });
  const pan = usePanGesture({
    maxPointers: 2,
    onUpdate: (e) => {
      'worklet';
      const c = clamp(scale.value, tx.value + e.changeX, ty.value + e.changeY);
      tx.value = c.x;
      ty.value = c.y;
    },
  });
  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    onDeactivate: (e) => {
      'worklet';
      if (e.canceled) return;
      const next = Math.min(maxScale, scale.value * 2);
      const r = next / scale.value;
      const c = clamp(next, e.x - (e.x - tx.value) * r, e.y - (e.y - ty.value) * r);
      scale.value = withTiming(next);
      tx.value = withTiming(c.x);
      ty.value = withTiming(c.y);
    },
  });
  const gesture = useSimultaneousGestures(pinch, pan, doubleTap);

  useAnimatedReaction(
    () => scale.value >= detailScale,
    (detail, prev) => {
      if (prev !== null && detail !== prev && onDetailChange) runOnJS(onDetailChange)(detail);
    },
    [detailScale, onDetailChange],
  );
  // 처음부터 확대해서 열면(initialFocus) 한 번 알려 준다
  useEffect(() => {
    if (start.s >= detailScale) onDetailChange?.(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mapStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  const paths = useMemo(
    () => (
      <Svg width={baseW} height={baseH} viewBox={`0 0 ${KOREA_MAP.width} ${KOREA_MAP.height}`}>
        {KOREA_MAP.sigungu.map((r) => (
          <Path
            key={r.code}
            d={r.d}
            fill={fills[r.code] ?? fills[r.parent] ?? LAND}
            stroke={colors.line.default}
            strokeWidth={0.6}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {KOREA_MAP.sido.map((r) => (
          <Path
            key={r.code}
            d={r.d}
            fill="none"
            stroke={colors.line.strong}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </Svg>
    ),
    [baseW, baseH, fills],
  );

  return (
    <GestureDetector gesture={gesture}>
      <View style={StyleSheet.absoluteFill} collapsable={false}>
        <Animated.View style={[styles.map, { width: baseW, height: baseH }, mapStyle]}>
          {paths}
        </Animated.View>
        {pins.map((p) => (
          <PinView key={p.key} pin={p} fit={fit} scale={scale} tx={tx} ty={ty} />
        ))}
      </View>
    </GestureDetector>
  );
}

function PinView({
  pin,
  fit,
  scale,
  tx,
  ty,
}: {
  pin: KoreaMapPin;
  fit: number;
  scale: SharedValue<number>;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
}) {
  const [px, py] = pin.point;
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: px * fit * scale.value + tx.value },
      { translateY: py * fit * scale.value + ty.value },
    ],
  }));
  // 크기 0인 자리에 놓고 안쪽을 가운데·아래 기준으로 맞춘다(핀 크기를 몰라도 됨)
  return (
    <Animated.View
      style={[styles.pin, pin.anchor === 'center' ? styles.center : styles.bottom, style]}
      pointerEvents="box-none"
    >
      <View
        style={pin.anchor === 'center' ? styles.centerInner : styles.bottomInner}
        pointerEvents="box-none"
      >
        {pin.children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, overflow: 'hidden', backgroundColor: colors.map.sea },
  map: { position: 'absolute', left: 0, top: 0, transformOrigin: 'left top' },
  pin: { position: 'absolute', left: 0, top: 0, width: 0, height: 0, alignItems: 'center' },
  center: { justifyContent: 'center' },
  bottom: { justifyContent: 'flex-end' },
  centerInner: { position: 'absolute', width: PIN_ROOM, alignItems: 'center' },
  bottomInner: { position: 'absolute', bottom: 0, width: PIN_ROOM, alignItems: 'center' },
  credit: {
    ...typography.micro,
    fontFamily: typography.caption.fontFamily,
    position: 'absolute',
    right: spacing[12],
    color: colors.map.label,
  },
});
