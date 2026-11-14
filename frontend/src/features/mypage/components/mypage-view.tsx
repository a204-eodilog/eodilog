import { SCROLL_DECELERATION } from '@/theme/scroll';
import { useState } from 'react';
import { type LayoutChangeEvent, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Avatar,
  Button,
  ErrorState,
  Icon,
  type IconName,
  KoreaMap,
  type KoreaMapPin,
} from '@/components/ui';
import { Stagger } from '@/components/ui/stagger';
import { PressableScale } from '@/components/ui/pressable-scale';
import { SkeletonList } from '@/components/ui/skeleton';
import { findMapRegion, MAINLAND_BOUNDS, mapFit } from '@/lib/korea-map';
import { colors, layout, radius, spacing, typography } from '@/theme';

import {
  type PinLabelSpot,
  pinLabelWidth,
  placePinLabels,
  profileLine,
  tripListLine,
} from '../mypage-rules';
import type { MyPageSummary, MyTripPin } from '../types';

export type MyPageViewProps = {
  state: 'loading' | 'error' | 'empty' | 'ready';
  summary?: MyPageSummary;
  onRetry: () => void;
  onTrips: () => void;
  onNewTrip: () => void;
  onTimeline: () => void;
  onFriends: () => void;
  onSettings: () => void;
  onPin: (pin: MyTripPin) => void;
};

const MAP_HEIGHT = 250;

/** S37 마이페이지. 값과 동작은 모두 props로 받는다(실제 화면·미리보기 공용) */
export function MyPageView(props: MyPageViewProps) {
  const { state, summary } = props;
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {/* 홈·저장 탭처럼 제목 줄은 스크롤 밖에 고정 */}
      <View style={styles.bar}>
        <Text style={styles.pageTitle} accessibilityRole="header">
          마이페이지
        </Text>
      </View>
      {state === 'error' ? (
        <ErrorState title="마이페이지를 불러오지 못했어요" onRetry={props.onRetry} />
      ) : state === 'loading' || !summary ? (
        <SkeletonList style={styles.flex} />
      ) : (
        <ScrollView
          decelerationRate={SCROLL_DECELERATION}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Stagger itemStyle={styles.staggerItem}>
            {/* 프로필. 얼굴 옆에 숫자 넷(여행·게시·팔로워·팔로잉), 아래에 이름과 버튼 둘. 숫자를 누르면 그 목록으로 간다 */}
            <View style={styles.profile}>
              <View style={styles.profileTop}>
                <View style={styles.ring}>
                  <Avatar name={summary.nickname} imageUrl={summary.profileImageUrl} size={76} me />
                </View>
                <View style={styles.stats}>
                  <Stat label="여행" value={summary.tripCount} onPress={props.onTrips} />
                  <Stat label="게시" value={summary.postedCount} onPress={props.onTimeline} />
                  <Stat label="팔로워" value={summary.followerCount} onPress={props.onFriends} />
                  <Stat label="팔로잉" value={summary.followingCount} onPress={props.onFriends} />
                </View>
              </View>
              <View>
                <Text style={styles.name} numberOfLines={1}>
                  {summary.nickname}
                </Text>
                <Text style={styles.sub}>{profileLine(summary)}</Text>
              </View>
              <View style={styles.profileButtons}>
                <PressableScale
                  onPress={props.onSettings}
                  style={({ pressed }) => [styles.profileButton, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="프로필 편집"
                >
                  <Icon name="pencil" size={16} color={colors.text.default} />
                  <Text style={styles.profileButtonText}>프로필 편집</Text>
                </PressableScale>
                <PressableScale
                  onPress={props.onFriends}
                  style={({ pressed }) => [styles.profileButton, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="친구 보기"
                >
                  <Icon name="people" size={16} color={colors.text.default} />
                  <Text style={styles.profileButtonText}>친구</Text>
                </PressableScale>
              </View>
            </View>

            <MapCard {...props} summary={summary} />

            {state === 'ready' ? (
              <View style={styles.legend}>
                <View style={styles.legendItem}>
                  <View style={styles.legendDot} />
                  <Text style={styles.legendText}>게시됨</Text>
                </View>
                <View style={styles.legendItem}>
                  <Icon name="lock" size={14} color={colors.text.icon} />
                  <Text style={styles.legendText}>비공개 · 나만 봐요</Text>
                </View>
              </View>
            ) : null}

            {/* 메뉴. 한 카드에 줄로 둔다. 이름 옆에 설명이나 숫자가 함께 보인다 */}
            <View style={styles.menu}>
              {summary.tripCount > 0 ? (
                <>
                  <Tile
                    icon="list"
                    label="내 여행 목록"
                    note={tripListLine(summary)}
                    accessibilityLabel={`내 여행 목록, ${tripListLine(summary)}`}
                    onPress={props.onTrips}
                  />
                  <View style={styles.rule} />
                </>
              ) : null}
              <Tile icon="clock" label="타임라인" onPress={props.onTimeline} />
              <View style={styles.rule} />
              <Tile icon="gear" label="설정" onPress={props.onSettings} />
            </View>
          </Stagger>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/** 내 여행 지도. 화면 안 카드라 손가락 확대는 끄고(세로 스크롤 우선) 핀만 누른다 */
function MapCard(props: MyPageViewProps & { summary: MyPageSummary }) {
  const empty = props.state === 'empty';
  const map = useTripPinMap(empty ? [] : props.summary.pins, props.onPin);
  return (
    <View style={styles.mapCard} onLayout={map.onLayout}>
      <View
        style={[StyleSheet.absoluteFill, empty && styles.mapFaded]}
        pointerEvents={empty ? 'none' : 'box-none'}
      >
        <KoreaMap
          pins={map.pins}
          interactive={false}
          initialFocus={map.focus}
          focus={map.moveTo}
          creditBottom={spacing[6]}
        />
      </View>
      {empty ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>아직 기록한 여행이 없어요</Text>
          <Text style={styles.emptyDesc}>
            다녀온 여행을 기록하면 여기에 핀이 생겨요.{'\n'}게시하기 전에는 나만 봐요
          </Text>
          <Button
            label="여행 만들기"
            icon="plus"
            onPress={props.onNewTrip}
            style={styles.emptyButton}
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * 핀들이 모인 곳으로 처음 화면을 맞춘다(Figma S37은 남쪽을 확대해서 보여 줌).
 * 핀 범위가 넓을수록 덜 확대한다. 전국에 흩어져 있으면 배율 1(전국)
 */
export function focusOn(pins: readonly MyTripPin[]) {
  const pts = pins.flatMap((p) => {
    const r = findMapRegion(p.regionCode);
    return r ? [r.point] : [];
  });
  if (pts.length === 0) return undefined;
  // 핀이 하나면 그 둘레(시도 몇 개)가 보이게 조금만 확대한다
  if (pts.length === 1) return { point: pts[0], scale: 1.4 };
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  // 본토 폭 약 510·높이 약 930(지도 좌표). 핀 범위에 이름표 여유(가로 120·세로 160)를 더해 그만큼 키운다
  const scale = Math.min(2.6, Math.max(1, Math.min(510 / (spanX + 120), 930 / (spanY + 160))));
  return {
    point: [
      (Math.max(...xs) + Math.min(...xs)) / 2,
      (Math.max(...ys) + Math.min(...ys)) / 2,
    ] as const,
    scale,
  };
}

/**
 * 여행 핀 지도(S37 마이페이지·S40 친구에게 보이는 모습·S44 친구 프로필 공용).
 * 지도 상자 크기를 재서 가까운 핀의 알약이 겹치거나 다른 점을 가리면 알약을 옆·아래로 옮긴다(점은 제자리). 확대하지 않는 지도라 처음 배율로 한 번 계산한다
 */
/** 전국 보기 가운데(KoreaMap 처음 위치와 같다) */
const WHOLE_KOREA = [
  (MAINLAND_BOUNDS.x0 + MAINLAND_BOUNDS.x1) / 2,
  (MAINLAND_BOUNDS.y0 + MAINLAND_BOUNDS.y1) / 2,
] as [number, number];

export function useTripPinMap<P extends MyTripPin>(pins: readonly P[], onPress: (pin: P) => void) {
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((b) => (b && b.width === width && b.height === height ? b : { width, height }));
  };
  const focus = focusOn(pins);
  const placed = pins.flatMap((p) => {
    const r = findMapRegion(p.regionCode);
    return r ? [{ pin: p, point: r.point }] : [];
  });
  const k = box ? mapFit(box) * (focus?.scale ?? 1) : 0;
  const spots = placePinLabels(
    placed.map(({ pin, point }) => ({
      key: pin.regionCode,
      x: point[0] * k,
      y: point[1] * k,
      width: pinLabelWidth(pin.label),
    })),
  );
  const mapPins: KoreaMapPin[] = placed.map(({ pin, point }) => ({
    key: pin.regionCode,
    point,
    anchor: 'bottom' as const,
    children: (
      <TripPin
        pin={pin}
        spot={box ? spots.get(pin.regionCode) : undefined}
        onPress={() => onPress(pin)}
      />
    ),
  }));
  // 핀이 바뀌면(친구 칩·늦게 온 지역) 지도를 새로 만들지 않고 범위만 부드럽게 옮긴다.
  // 지도를 key로 새로 만들면 선·면 700개를 처음부터 다시 그려 버벅인다(11/09 직접 확인)
  // 핀이 없으면 전국 보기(본토 가운데, 배율 1)로 돌아간다(!165 리뷰: 이전 범위에 남던 것)
  const moveTo = focus
    ? { key: placed.map(({ pin }) => pin.regionCode).join('|'), ...focus }
    : { key: 'none', point: WHOLE_KOREA, scale: 1 };
  return { onLayout, pins: mapPins, focus, moveTo };
}

/** 지도 핀. 게시한 여행은 파란 알약(사람 아이콘), 게시 전은 흰 알약(자물쇠) */
export function TripPin({
  pin,
  onPress,
  spot,
}: {
  pin: MyTripPin;
  onPress: () => void;
  /** 옆 핀과 겹치지 않게 옮긴 알약 자리. 점은 제자리에 둔다. 없으면 점 바로 위 */
  spot?: PinLabelSpot;
}) {
  const dx = spot?.dx ?? 0;
  const below = spot?.below ?? false;
  // 아래에 둘 때는 점·알약 순서를 바꾸고, 점이 제자리에 오도록 (알약 28 + 간격 4)만큼 내린다
  const move =
    dx || below ? { transform: [{ translateX: dx }, { translateY: below ? 32 : 0 }] } : null;
  const dot = (
    <View
      style={[
        styles.pinDot,
        pin.posted && styles.pinDotPosted,
        dx ? { transform: [{ translateX: -dx }] } : null,
      ]}
    />
  );
  return (
    <PressableScale
      onPress={onPress}
      style={[styles.pinWrap, move]}
      accessibilityRole="button"
      accessibilityLabel={`${pin.label}, ${pin.posted ? '게시됨' : '나만 봐요'}`}
    >
      {below ? dot : null}
      <View style={[styles.pin, pin.posted ? styles.pinPosted : styles.pinPrivate]}>
        <Icon
          name={pin.posted ? 'people' : 'lock'}
          size={14}
          color={pin.posted ? colors.text.inverse : colors.text.icon}
        />
        <Text style={[styles.pinText, pin.posted && styles.pinTextPosted]} numberOfLines={1}>
          {pin.label}
        </Text>
      </View>
      {below ? null : dot}
    </PressableScale>
  );
}

/** 프로필 숫자 한 칸. 큰 숫자 아래 작은 이름. 다 세지 못했으면 줄표 */
function Stat({
  label,
  value,
  onPress,
}: {
  label: string;
  value: number | null;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      style={({ pressed }) => [styles.stat, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={value === null ? label : `${label} ${value}`}
    >
      <Text style={styles.statValue}>{value === null ? '–' : value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </PressableScale>
  );
}

function Tile({
  icon,
  label,
  note,
  count,
  accessibilityLabel,
  onPress,
}: {
  icon: IconName;
  label: string;
  /** 이름 아래 설명 줄 */
  note?: string;
  /** 오른쪽 숫자("2명") */
  count?: string | null;
  accessibilityLabel?: string;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (count ? `${label} ${count}` : label)}
    >
      <View style={styles.tileIcon}>
        <Icon name={icon} size={20} color={colors.brand.primary} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.tileLabel}>{label}</Text>
        {note ? <Text style={styles.sub}>{note}</Text> : null}
      </View>
      {count ? <Text style={styles.tileCount}>{count}</Text> : null}
      <Icon name="chevron-right" size={18} color={colors.text.muted} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  // 차례로 나타나는 구역을 감싼 칸. 한 구역이 여러 줄이면 그 사이 간격을 스크롤 내용과 같게 둔다
  staggerItem: { gap: spacing[20] },
  // 바탕은 옅은 회색, 내용은 카드에 담는다
  screen: { flex: 1, backgroundColor: colors.surface.subtle },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  content: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[8],
    paddingBottom: spacing[32],
    gap: spacing[20],
  },
  bar: { height: 56, justifyContent: 'center', paddingHorizontal: layout.screenPaddingX },
  pageTitle: { ...typography.title1, color: colors.text.default },
  // 프로필은 흰 카드. 얼굴 옆에 숫자 셋, 아래에 이름과 버튼 둘(인스타그램 프로필 배치)
  profile: {
    gap: spacing[14],
    padding: spacing[20],
    borderRadius: radius.xxl,
    backgroundColor: colors.surface.white,
  },
  profileTop: { flexDirection: 'row', alignItems: 'center', gap: spacing[12] },
  // 얼굴 둘레의 파랑 고리. 흰 틈을 두고 두른다
  ring: {
    padding: 3,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.brand.primary,
  },
  stats: { flex: 1, flexDirection: 'row' },
  stat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    borderRadius: radius.lg,
  },
  statValue: { ...typography.title2, color: colors.text.default, fontVariant: ['tabular-nums'] },
  statLabel: { ...typography.caption, color: colors.text.sub },
  name: { ...typography.title3, color: colors.text.default },
  profileButtons: { flexDirection: 'row', gap: spacing[8] },
  profileButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[6],
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.surface.default,
  },
  profileButtonText: { ...typography.captionBold, color: colors.text.default },
  sub: { ...typography.caption, color: colors.text.sub },
  mapCard: {
    height: MAP_HEIGHT,
    borderRadius: radius.xxl,
    overflow: 'hidden',
    backgroundColor: colors.map.seaMid,
  },
  mapFaded: { opacity: 0.35 },
  emptyBox: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[10],
    paddingHorizontal: spacing[20],
  },
  emptyTitle: { ...typography.bodyBold, color: colors.text.default },
  emptyDesc: { ...typography.caption, color: colors.text.sub, textAlign: 'center' },
  emptyButton: { marginTop: spacing[6], alignSelf: 'center' },
  legend: { flexDirection: 'row', gap: spacing[16], marginTop: -spacing[8] },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
    backgroundColor: colors.brand.primary,
  },
  legendText: { ...typography.caption, color: colors.text.sub },
  menu: {
    paddingVertical: spacing[6],
    paddingHorizontal: spacing[16],
    borderRadius: radius.xl,
    backgroundColor: colors.surface.white,
  },
  rule: { height: 1, marginLeft: 54, backgroundColor: colors.line.default },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[14],
    minHeight: 64,
    paddingVertical: spacing[10],
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.brand.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: { ...typography.bodyBold, color: colors.text.default },
  tileCount: { ...typography.bodyMedium, color: colors.brand.primary },
  pinWrap: { alignItems: 'center', gap: spacing[4], marginBottom: -5 },
  pin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    height: 28,
    paddingHorizontal: spacing[10],
    borderRadius: radius.full,
    boxShadow: `0 2px 8px ${colors.shadow}`,
  },
  pinPosted: { backgroundColor: colors.brand.primary },
  pinPrivate: { backgroundColor: colors.surface.white },
  pinText: { ...typography.captionBold, color: colors.text.default, maxWidth: 120 },
  pinTextPosted: { color: colors.text.inverse },
  pinDot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
    backgroundColor: colors.text.default,
    borderWidth: 2,
    borderColor: colors.surface.white,
  },
  pinDotPosted: { backgroundColor: colors.brand.primary },
});
