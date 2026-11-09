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
  Easing,
  runOnJS,
  type SharedValue,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, G, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import {
  KOREA_MAP,
  KOREA_MAP_CREDIT,
  MAINLAND_BOUNDS,
  mapFit,
  type MapPoint,
} from '@/lib/korea-map';
import { colors, spacing, typography } from '@/theme';

export type KoreaMapPin = {
  key: string;
  /** 지도 좌표. 지역 핀은 findMapRegion(code).point, 위경도는 projectLatLng */
  point: MapPoint;
  /** bottom: 핀 아래 끝이 점에 닿음(말풍선), center: 가운데가 점, left·right: 핀의 왼쪽·오른쪽 끝(세로 가운데)이 점 */
  anchor?: 'bottom' | 'center' | 'left' | 'right';
  /** 처음 나타날 때 기다릴 시간(ms). 있으면 아래에서 올라오며 나타난다(Figma S05 핀 등장) */
  enterDelayMs?: number;
  children: ReactNode;
};

/** 차례로 물들 지역. colors는 옅은 색부터 최종 색까지 겹겹이 칠한다 */
export type KoreaMapFillStep = { code: string; colors: readonly string[] };

export type KoreaMapProps = {
  /** 지역 코드 → 칠할 색. 시군구 코드가 먼저, 없으면 그 시도 코드 */
  fills?: Readonly<Record<string, string>>;
  /** 화면에 들어올 때 배열 순서대로 차례차례 물드는 지역(Figma S05 모션). 한 번만 재생 */
  fillSteps?: readonly KoreaMapFillStep[];
  pins?: readonly KoreaMapPin[];
  /** 확대 단계가 시작하는 배율. 기본 MAP_STAGES(5단계) */
  stages?: readonly number[];
  /** 확대 단계가 바뀔 때 알린다. 지도 선은 단계가 바뀔 때만 다시 그려 확대 중에 깜빡이지 않는다 */
  onStageChange?: (stage: MapStage) => void;
  /** 처음 볼 곳. 없으면 전국 */
  initialFocus?: { point: MapPoint; scale: number };
  /** key가 바뀔 때마다 그곳으로 부드럽게 확대해 옮긴다(묶인 핀을 눌렀을 때) */
  focus?: { key: string | number; point: MapPoint; scale: number };
  /** 최대 배율. 경계를 단순하게 줄여 두어 더 키우면 선이 각져 보이고, 홈은 시군까지만 보면 된다 */
  maxScale?: number;
  /** false면 손가락으로 확대·이동하지 않는다. 화면 안 작은 카드 지도(S37)가 세로 스크롤을 막지 않게 */
  interactive?: boolean;
  /** false면 출처 표기를 숨긴다. 부르는 쪽이 따로 표기할 때만 */
  showCredit?: boolean;
  /** 지도 위를 덮는 것(위 버튼·아래 시트)의 높이. 처음 맞출 때 이 영역을 피한다 */
  inset?: { top?: number; bottom?: number };
  /** 출처 표기 위치를 아래에서 띄울 때(아래 시트가 덮는 화면) */
  creditBottom?: number;
  style?: ViewStyle;
};

/**
 * 확대 5단계가 시작하는 배율. 1 전국(시도 묶음) · 2 권역 · 3 시군 이름표 · 4 사진 카드 · 5 가장 가까이.
 * 단계 안에서는 핀 모양과 선 굵기가 그대로라 확대하는 동안 화면이 바뀌지 않는다
 */
export const MAP_STAGES = [1, 1.6, 2.4, 3.2, 4.2] as const;

/** index: 0부터 단계 번호, pxPerUnit: 그 단계가 시작하는 배율에서 지도 좌표 1이 화면 몇 px인지(핀 겹침 계산용) */
export type MapStage = { index: number; pxPerUnit: number };

/** fills를 안 넘길 때 기본값. 그릴 때마다 새 객체가 되면 경로 700여 개를 매번 다시 만든다 */
const NO_FILLS: Readonly<Record<string, string>> = {};

const MIN_SCALE = 1;
/** 핀 내용이 꺾이지 않고 놓일 너비. 이보다 넓은 핀은 없다 */
const PIN_ROOM = 280;
const LAND = colors.surface.white;

/**
 * Figma S05 모션(3.5초 타임라인) 값. 지역은 0.2초부터 0.18초 간격으로 0.5초 동안 물들고,
 * 더 진한 층은 0.35초씩 뒤에 겹친다. 핀은 물들기가 끝난 뒤 0.15초 간격으로 10px 올라오며 나타난다.
 * Figma는 미리보기라 전체가 반복되지만 앱은 화면에 들어올 때 한 번만 재생한다
 */
export const MAP_MOTION = {
  fillStartMs: 200,
  fillStaggerMs: 180,
  fillFadeMs: 500,
  layerGapMs: 350,
  pinGapAfterFillMs: 260,
  pinStaggerMs: 150,
  pinRiseMs: 350,
  pinFadeMs: 300,
  pinRisePx: 10,
} as const;

/** fillSteps 길이로 핀이 나오기 시작할 때(ms) */
export function pinEnterStartMs(fillCount: number): number {
  return (
    MAP_MOTION.fillStartMs + fillCount * MAP_MOTION.fillStaggerMs + MAP_MOTION.pinGapAfterFillMs
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * 시도·시군구 SVG 물든 지도. 네이버 지도가 아니라 경계(통계청 SGIS)를 직접 그린다.
 * 두 손가락 확대·축소, 한 손가락 이동, 두 번 누르면 확대. 핀은 확대해도 크기가 그대로다.
 * S05 홈·S37 마이페이지·S40·S07·S42가 같이 쓴다. 화면별 값(색 단계, 핀 모양)은 부르는 쪽이 정한다.
 */
export function KoreaMap({
  fills = NO_FILLS,
  fillSteps = [],
  pins = [],
  stages = MAP_STAGES,
  onStageChange,
  initialFocus,
  focus,
  maxScale = 5,
  interactive = true,
  showCredit = true,
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
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="sea" cx="50%" cy="42%" rx="75%" ry="60%">
            <Stop offset="0" stopColor={colors.map.seaCenter} />
            <Stop offset="0.55" stopColor={colors.map.seaMid} />
            <Stop offset="1" stopColor={colors.map.seaEdge} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#sea)" />
      </Svg>
      {box ? (
        <MapCanvas
          // 화면 크기가 바뀌면(회전·창 크기) 처음 맞춤부터 다시 한다
          key={`${box.width}x${box.height}`}
          box={box}
          fills={fills}
          fillSteps={fillSteps}
          pins={pins}
          stages={stages}
          onStageChange={onStageChange}
          initialFocus={initialFocus}
          focus={focus}
          maxScale={maxScale}
          interactive={interactive}
          insetTop={inset?.top ?? 0}
          insetBottom={inset?.bottom ?? 0}
        />
      ) : null}
      {showCredit ? (
        <Text style={[styles.credit, { bottom: creditBottom }]} pointerEvents="none">
          {KOREA_MAP_CREDIT}
        </Text>
      ) : null}
    </View>
  );
}

type CanvasProps = Required<
  Pick<KoreaMapProps, 'fills' | 'fillSteps' | 'pins' | 'stages' | 'maxScale' | 'interactive'>
> &
  Pick<KoreaMapProps, 'onStageChange' | 'initialFocus' | 'focus'> & {
    box: { width: number; height: number };
    insetTop: number;
    insetBottom: number;
  };

function MapCanvas({
  box,
  fills,
  fillSteps,
  pins,
  stages,
  onStageChange,
  initialFocus,
  focus,
  maxScale,
  interactive,
  insetTop,
  insetBottom,
}: CanvasProps) {
  // 본토 + 제주가 덮이지 않는 영역에 들어오는 크기(배율 1)와 그 가운데
  const b = MAINLAND_BOUNDS;
  const visibleH = Math.max(1, box.height - insetTop - insetBottom);
  const fit = mapFit(box, insetTop, insetBottom);
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

  // 국내 여행만 다루므로 지도를 한국 밖으로 옮기지 못하게 묶는다.
  // 처음 크기(배율 1)에서는 본토가 화면 안에 다 들어와 움직이지 않고, 확대하면 그 범위 안에서만 옮긴다.
  // 2배 이상 확대하면 동쪽 끝(울릉도·독도)까지 갈 수 있다
  const clamp = (s: number, x: number, y: number) => {
    'worklet';
    const k = fit * s;
    const pad = 24;
    const left = b.x0 * k;
    const right = (s >= 2 ? KOREA_MAP.width : b.x1) * k;
    const top = b.y0 * k;
    const bottom = b.y1 * k;
    const visTop = insetTop;
    const visBottom = box.height - insetBottom;
    const cx =
      right - left <= box.width
        ? box.width / 2 - (left + right) / 2
        : Math.min(pad - left, Math.max(box.width - pad - right, x));
    const cy =
      bottom - top <= visBottom - visTop
        ? (visTop + visBottom) / 2 - (top + bottom) / 2
        : Math.min(visTop + pad - top, Math.max(visBottom - pad - bottom, y));
    return { x: cx, y: cy };
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

  /** 배율 s가 속한 단계의 시작 배율. 단계 사이에 멈추지 않게 손을 떼면 여기로 붙인다 */
  const stageStart = (s: number) => {
    'worklet';
    let i = 0;
    while (i + 1 < stages.length && s >= stages[i + 1]) i += 1;
    return stages[i];
  };
  /** 점(fx, fy)이 그 자리에 있도록 배율 next로 부드럽게 옮긴다 */
  const animateTo = (fx: number, fy: number, next: number) => {
    'worklet';
    const r = next / scale.value;
    const c = clamp(next, fx - (fx - tx.value) * r, fy - (fy - ty.value) * r);
    const timing = { duration: 220, easing: Easing.out(Easing.cubic) };
    scale.value = withTiming(next, timing);
    tx.value = withTiming(c.x, timing);
    ty.value = withTiming(c.y, timing);
  };

  const pinch = usePinchGesture({
    onUpdate: (e) => {
      'worklet';
      zoomAt(e.focalX, e.focalY, e.scaleChange);
    },
    // 손을 떼면 가장 가까운 단계로 붙어, 어중간한 배율에서 멈추지 않는다
    onDeactivate: (e) => {
      'worklet';
      const s = scale.value;
      const low = stageStart(s);
      const i = stages.indexOf(low);
      const high = i + 1 < stages.length ? stages[i + 1] : maxScale;
      const next = s - low < high - s ? low : Math.min(high, maxScale);
      if (next !== s) animateTo(e.focalX, e.focalY, next);
    },
  });
  const pan = usePanGesture({
    // 두 손가락은 확대만 한다. 확대하면서 지도가 같이 밀리지 않게
    maxPointers: 1,
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
      // 두 번 누르면 그 자리로 한 단계 확대. 마지막 단계면 전국으로 돌아간다
      const i = stages.indexOf(stageStart(scale.value));
      const next = i + 1 < stages.length ? stages[i + 1] : stages[0];
      animateTo(e.x, e.y, next);
    },
  });
  const gesture = useSimultaneousGestures(pinch, pan, doubleTap);

  // 확대 단계. 1단계(전국)에서는 시군구 선을 숨겨 지도가 복잡해 보이지 않게 하고,
  // 지도를 통째로 키우면 선도 두꺼워지므로 단계 배율로 선 굵기를 나눈다. 둘 다 단계가 바뀔 때만 바뀐다
  const stageOf = (s: number) => {
    'worklet';
    let i = 0;
    while (i + 1 < stages.length && s >= stages[i + 1]) i += 1;
    return i;
  };
  const [stage, setStageState] = useState(() => stageOf(start.s));
  const setStage = (next: number) => {
    setStageState(next);
    onStageChange?.({ index: next, pxPerUnit: fit * stages[next] });
  };
  useAnimatedReaction(
    () => stageOf(scale.value),
    (next, prev) => {
      if (prev !== null && next !== prev) runOnJS(setStage)(next);
    },
  );
  useEffect(() => {
    onStageChange?.({ index: stage, pxPerUnit: fit * stages[stage] });
    // 처음 한 번 알려 준다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /** 화면 px → viewBox 단위 */
  const px = (n: number) => n / (fit * stages[stage]);
  const detail = stage > 0;

  useEffect(() => {
    if (!focus) return;
    const next = Math.min(maxScale, Math.max(MIN_SCALE, focus.scale));
    const visTop = insetTop;
    const visBottom = box.height - insetBottom;
    const target = clamp(
      next,
      box.width / 2 - focus.point[0] * fit * next,
      (visTop + visBottom) / 2 - focus.point[1] * fit * next,
    );
    const timing = { duration: 450, easing: Easing.out(Easing.cubic) };
    scale.set(withTiming(next, timing));
    tx.set(withTiming(target.x, timing));
    ty.set(withTiming(target.y, timing));
    // focus.key가 바뀔 때만 움직인다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.key]);

  const mapStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  // 그림을 세 장으로 나눠 겹친다(아래 땅·시군구 / 가운데 물드는 지역 / 위 시도 경계).
  // 한 장이면 물드는 동안 매 순간 550개 넘는 선·면 전체를 다시 그려 안드로이드에서 버벅인다(11/09 폰 확인).
  // 나누면 물드는 동안 가운데 장(지역 몇 개)만 다시 그린다
  const paths = useMemo(
    () => (
      <>
        <Svg
          style={styles.layer}
          width={baseW}
          height={baseH}
          viewBox={`0 0 ${KOREA_MAP.width} ${KOREA_MAP.height}`}
        >
          {/* 땅 아래 옅은 그림자와 흰 빛 (Figma S05) */}
          <G transform={`translate(0 ${px(2)})`}>
            {KOREA_MAP.sido.map((r) => (
              <Path key={r.code} d={r.d} fill={colors.shadow} />
            ))}
          </G>
          {KOREA_MAP.sido.map((r) => (
            <Path
              key={r.code}
              d={r.d}
              fill={LAND}
              stroke={LAND}
              strokeWidth={px(5)}
              strokeLinejoin="round"
              strokeOpacity={0.8}
            />
          ))}
          {KOREA_MAP.sigungu.map((r) => (
            <Path key={r.code} d={r.d} fill={fills[r.code] ?? fills[r.parent] ?? LAND} />
          ))}
          {/* 시군구 선은 칠한 면과 따로 그려, 단계가 바뀌어도 면은 다시 그리지 않는다 */}
          {/* 2~3단계는 옅게, 4단계부터 제대로 보인다 */}
          {detail ? (
            <G
              fill="none"
              stroke={colors.line.default}
              strokeWidth={px(0.6)}
              strokeOpacity={stage >= 3 ? 1 : 0.45}
            >
              {KOREA_MAP.sigungu.map((r) => (
                <Path key={r.code} d={r.d} />
              ))}
            </G>
          ) : null}
        </Svg>
        <Svg
          style={styles.layer}
          width={baseW}
          height={baseH}
          viewBox={`0 0 ${KOREA_MAP.width} ${KOREA_MAP.height}`}
        >
          {fillSteps.map((step, i) => {
            const shape = SHAPE.get(step.code);
            if (!shape) return null;
            return step.colors.map((color, layer) => (
              <FillLayer
                key={`${step.code}-${layer}`}
                d={shape}
                color={color}
                delayMs={
                  MAP_MOTION.fillStartMs +
                  i * MAP_MOTION.fillStaggerMs +
                  layer * MAP_MOTION.layerGapMs
                }
              />
            ));
          })}
        </Svg>
        <Svg
          style={styles.layer}
          width={baseW}
          height={baseH}
          viewBox={`0 0 ${KOREA_MAP.width} ${KOREA_MAP.height}`}
        >
          {KOREA_MAP.sido.map((r) => (
            <Path
              key={r.code}
              d={r.d}
              fill="none"
              stroke={colors.line.default}
              strokeWidth={px(detail ? 1 : 0.8)}
            />
          ))}
        </Svg>
      </>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseW, baseH, fills, fillSteps, stage],
  );

  const body = (
    <View style={StyleSheet.absoluteFill} collapsable={false}>
      <Animated.View style={[styles.map, { width: baseW, height: baseH }, mapStyle]}>
        {paths}
      </Animated.View>
      {pins.map((p) => (
        <PinView key={p.key} pin={p} fit={fit} scale={scale} tx={tx} ty={ty} />
      ))}
    </View>
  );
  return interactive ? <GestureDetector gesture={gesture}>{body}</GestureDetector> : body;
}

const SHAPE = new Map([...KOREA_MAP.sido, ...KOREA_MAP.sigungu].map((r) => [r.code, r.d] as const));

/** 한 지역의 한 겹. 정해진 때에 0.5초 동안 서서히 칠해진다 */
function FillLayer({ d, color, delayMs }: { d: string; color: string; delayMs: number }) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    opacity.set(
      withDelay(
        delayMs,
        withTiming(1, { duration: MAP_MOTION.fillFadeMs, easing: Easing.out(Easing.quad) }),
      ),
    );
    // 처음 한 번만 재생한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const animatedProps = useAnimatedProps(() => ({ fillOpacity: opacity.value }));
  return <AnimatedPath d={d} fill={color} animatedProps={animatedProps} />;
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
  const reduced = useReducedMotion();
  const animate = pin.enterDelayMs !== undefined && !reduced;
  // 나타나는 동안만 핀을 그림 한 장(하드웨어 텍스처)으로 굳혀 움직인다. 그림자 있는 말풍선이 반투명하게 나타나면
  // 안드로이드가 매 순간 따로 그려 합쳐서, 핀 여러 개가 동시에 나오면 버벅였다(11/09 폰 확인)
  const [entering, setEntering] = useState(animate);
  const rise = useSharedValue(animate ? MAP_MOTION.pinRisePx : 0);
  const shown = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (!animate) return;
    const delay = pin.enterDelayMs ?? 0;
    const easing = Easing.out(Easing.quad);
    rise.set(withDelay(delay, withTiming(0, { duration: MAP_MOTION.pinRiseMs, easing })));
    shown.set(withDelay(delay, withTiming(1, { duration: MAP_MOTION.pinFadeMs, easing })));
    // 다 나타나면 굳힌 그림을 푼다(안의 퍼지는 원이 계속 움직이므로)
    const done = setTimeout(
      () => setEntering(false),
      delay + Math.max(MAP_MOTION.pinRiseMs, MAP_MOTION.pinFadeMs) + 50,
    );
    return () => clearTimeout(done);
    // 처음 한 번만 재생한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [
      { translateX: px * fit * scale.value + tx.value },
      { translateY: py * fit * scale.value + ty.value + rise.value },
    ],
  }));
  // 크기 0인 자리에 놓고 안쪽을 가운데·아래 기준으로 맞춘다(핀 크기를 몰라도 됨)
  return (
    <Animated.View
      style={[
        styles.pin,
        pin.anchor === 'bottom' || !pin.anchor ? styles.bottom : styles.center,
        style,
      ]}
      pointerEvents="box-none"
      renderToHardwareTextureAndroid={entering}
    >
      <View style={styles[INNER[pin.anchor ?? 'bottom']]} pointerEvents="box-none">
        {pin.children}
      </View>
    </Animated.View>
  );
}

const INNER = {
  bottom: 'bottomInner',
  center: 'centerInner',
  left: 'leftInner',
  right: 'rightInner',
} as const;

const styles = StyleSheet.create({
  box: { flex: 1, overflow: 'hidden', backgroundColor: colors.map.seaEdge },
  map: { position: 'absolute', left: 0, top: 0, transformOrigin: 'left top' },
  layer: { position: 'absolute', left: 0, top: 0 },
  pin: { position: 'absolute', left: 0, top: 0, width: 0, height: 0, alignItems: 'center' },
  center: { justifyContent: 'center' },
  bottom: { justifyContent: 'flex-end' },
  centerInner: { position: 'absolute', width: PIN_ROOM, alignItems: 'center' },
  bottomInner: { position: 'absolute', bottom: 0, width: PIN_ROOM, alignItems: 'center' },
  leftInner: { position: 'absolute', left: 0, width: PIN_ROOM, alignItems: 'flex-start' },
  rightInner: { position: 'absolute', right: 0, width: PIN_ROOM, alignItems: 'flex-end' },
  credit: {
    ...typography.micro,
    fontFamily: typography.caption.fontFamily,
    position: 'absolute',
    right: spacing[12],
    color: colors.map.label,
  },
});
