import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Button,
  EmptyState,
  Icon,
  KoreaMap,
  type KoreaMapPin,
  MAP_MOTION,
  MascotTraveler,
  pinEnterStartMs,
} from '@/components/ui';
import { findMapRegion } from '@/lib/korea-map';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { fillStepsFor } from '../home-rules';
import type { HomeRecommendation, HomeState, RegionMark } from '../types';

import { InviteSpot, LockedFace, PhotoPin, RegionPill } from './map-pins';
import { RecommendSheet, SHEET_COLLAPSED } from './recommend-sheet';

export type HomeViewProps = {
  state: HomeState;
  marks: readonly RegionMark[];
  recommendations: readonly HomeRecommendation[];
  unreadCount: number;
  /** '공개된 기록 없음' 안내의 친구 수. 모르면 null */
  friendCount: number | null;
  /** '공개된 기록 없음'에서 친구 얼굴을 놓을 지역. 서버가 주지 않아 미리보기에서만 쓴다 */
  lockedFriends?: readonly { name: string; regionCode: string }[];
  /** 처음 확대해서 볼 지역 (미리보기 '지도 확대') */
  initialZoom?: { regionCode: string; scale: number };
  initialSheetExpanded?: boolean;
  onRetry: () => void;
  onTrend: () => void;
  onBell: () => void;
  onFindFriends: () => void;
  onNewTrip: () => void;
  onRegion: (mark: RegionMark) => void;
  onRecommendation: (item: HomeRecommendation) => void;
};

// 친구 없음 화면의 빈 자리 (Figma: 수도권·경북 동해안·여수 근처)
const INVITE_SPOTS = ['4100000000', '4711000000', '1213000000'];

/** S05 홈 친구 여행 지도. 값과 동작은 모두 props로 받는다(실제 화면·미리보기 공용) */
export function HomeView(props: HomeViewProps) {
  const { state, marks, unreadCount } = props;
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.logo}>
          <Icon name="map-pin" size={24} color={colors.brand.primary} filled />
          <Text style={styles.logoText}>어디로그</Text>
        </View>
        <Pressable
          onPress={props.onBell}
          style={styles.bell}
          accessibilityRole="button"
          accessibilityLabel={unreadCount > 0 ? `알림 ${unreadCount}개` : '알림'}
        >
          <Icon name="bell" size={24} color={colors.text.default} />
          {unreadCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {state === 'loading' ? (
        <ActivityIndicator style={styles.flex} color={colors.brand.primary} />
      ) : state === 'first-visit' ? (
        <EmptyState
          title="첫 여행을 만들어 볼까요?"
          description="새 여행을 만들거나 초대 링크로 참여해요"
          actionLabel="새 여행"
          onAction={props.onNewTrip}
          illustration={<MascotTraveler size={200} />}
        />
      ) : state === 'error' ? (
        <View style={styles.errorBox}>
          <View style={styles.errorIcon}>
            <Icon name="map" size={28} color={colors.text.icon} />
          </View>
          <Text style={styles.errorTitle}>지도를 불러오지 못했어요</Text>
          <Text style={styles.errorDesc}>연결을 확인해 주세요</Text>
          <Button
            label="다시 시도"
            onPress={props.onRetry}
            leading={<Icon name="refresh" size={20} color={colors.text.inverse} />}
            style={styles.errorButton}
          />
        </View>
      ) : (
        <MapBody {...props} marks={marks} />
      )}
    </SafeAreaView>
  );
}

function MapBody(props: HomeViewProps) {
  const { state, marks } = props;
  const [detail, setDetail] = useState(false);
  // 적게 다녀간 곳부터 차례로 물들고, 핀도 같은 순서로 나타난다(Figma S05 모션)
  const fillSteps = useMemo(() => fillStepsFor(marks), [marks]);
  const order = useMemo(() => new Map(fillSteps.map((f, i) => [f.code, i])), [fillSteps]);
  const top = fillSteps[fillSteps.length - 1]?.code;
  // 확대 카드는 북쪽부터 왼쪽·오른쪽을 번갈아 놓아 이웃 카드끼리 덜 겹치게 한다
  const sides = useMemo(() => {
    const byY = [...marks]
      .map((m) => ({ code: m.regionCode, y: findMapRegion(m.regionCode)?.point[1] ?? 0 }))
      .sort((a, b) => a.y - b.y);
    return new Map(
      byY.map((m, i) => [m.code, i % 2 === 0 ? ('left' as const) : ('right' as const)]),
    );
  }, [marks]);

  const pins = useMemo<KoreaMapPin[]>(() => {
    if (state === 'no-friends') {
      return INVITE_SPOTS.flatMap((code) => {
        const r = findMapRegion(code);
        return r ? [{ key: code, point: r.point, anchor: 'center', children: <InviteSpot /> }] : [];
      });
    }
    if (state === 'no-public') {
      return (props.lockedFriends ?? []).flatMap((f) => {
        const r = findMapRegion(f.regionCode);
        return r
          ? [
              {
                key: f.name,
                point: r.point,
                anchor: 'center',
                children: <LockedFace name={f.name} />,
              },
            ]
          : [];
      });
    }
    return marks.flatMap((m) => {
      const r = findMapRegion(m.regionCode);
      if (!r) return [];
      const press = () => props.onRegion(m);
      return [
        {
          key: m.regionCode,
          point: r.point,
          // 카드가 점 왼쪽이면 핀 오른쪽 끝이 점에 닿는다
          anchor: detail ? (sides.get(m.regionCode) === 'left' ? 'right' : 'left') : 'bottom',
          enterDelayMs:
            pinEnterStartMs(fillSteps.length) +
            (order.get(m.regionCode) ?? 0) * MAP_MOTION.pinStaggerMs,
          children: detail ? (
            <PhotoPin mark={m} side={sides.get(m.regionCode) ?? 'right'} onPress={press} />
          ) : (
            <RegionPill mark={m} onPress={press} pulse={m.regionCode === top} />
          ),
        },
      ];
    });
  }, [state, marks, detail, props, fillSteps, order, top, sides]);

  const focus = props.initialZoom ? findMapRegion(props.initialZoom.regionCode) : undefined;
  const ready = state === 'ready';
  const caption =
    state === 'no-friends'
      ? '친구가 생기면 여기에 보여요'
      : state === 'no-public'
        ? props.friendCount
          ? `친구 ${props.friendCount}명 · 아직 공개한 여행이 없어요`
          : '아직 공개한 친구 여행이 없어요'
        : null;
  const bottomSpace = ready ? SHEET_COLLAPSED : EMPTY_CARD_HEIGHT;

  return (
    <View style={styles.flex}>
      <KoreaMap
        fillSteps={fillSteps}
        pins={pins}
        onDetailChange={setDetail}
        initialFocus={
          focus && props.initialZoom
            ? { point: focus.point, scale: props.initialZoom.scale }
            : undefined
        }
        inset={{ top: TREND_SPACE, bottom: bottomSpace }}
        creditBottom={bottomSpace + spacing[8]}
      />
      <Pressable onPress={props.onTrend} style={styles.trend} accessibilityRole="button">
        <Icon name="trending" size={20} color={colors.brand.primary} />
        <Text style={styles.trendText}>요즘 뜨는 여행지</Text>
        <Icon name="chevron-right" size={16} color={colors.text.icon} />
      </Pressable>
      {caption ? (
        <Text style={[styles.caption, { bottom: bottomSpace + spacing[32] }]} pointerEvents="none">
          {caption}
        </Text>
      ) : null}
      {ready ? (
        <RecommendSheet
          items={props.recommendations}
          initialExpanded={props.initialSheetExpanded}
          onPress={props.onRecommendation}
        />
      ) : (
        <EmptyCard {...props} />
      )}
    </View>
  );
}

const EMPTY_CARD_HEIGHT = 168;
/** 위 "요즘 뜨는 여행지" 알약이 차지하는 높이 */
const TREND_SPACE = 28;

/** 친구 없음·공개된 기록 없음일 때 아래 안내 카드 */
function EmptyCard(props: HomeViewProps) {
  const noFriends = props.state === 'no-friends';
  return (
    <View style={styles.card}>
      <View style={styles.handle} />
      <View style={styles.cardRow}>
        <View style={styles.cardIcon}>
          <Icon name={noFriends ? 'people' : 'map'} size={22} color={colors.text.icon} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.cardTitle}>
            {noFriends ? '아직 팔로우한 사람이 없어요' : '볼 수 있는 친구 여행이 없어요'}
          </Text>
          <Text style={styles.cardDesc}>
            {noFriends
              ? '친구를 팔로우하면 여행이 지도에 보여요'
              : '친구가 공동 피드를 게시하면 지도에 보여요'}
          </Text>
        </View>
      </View>
      <View style={styles.cardActions}>
        {noFriends ? (
          <>
            <Button
              label="트렌드"
              variant="text"
              onPress={props.onTrend}
              leading={<Icon name="trending" size={20} color={colors.brand.primary} />}
            />
            <Button
              label="친구 찾기"
              onPress={props.onFindFriends}
              leading={<Icon name="person-add" size={20} color={colors.text.inverse} />}
            />
          </>
        ) : (
          <>
            <Button
              label="친구 찾기"
              variant="text"
              onPress={props.onFindFriends}
              leading={<Icon name="person-add" size={20} color={colors.brand.primary} />}
            />
            <Button
              label="요즘 뜨는 여행지"
              onPress={props.onTrend}
              leading={<Icon name="trending" size={20} color={colors.text.inverse} />}
            />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  flex: { flex: 1 },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: layout.screenPaddingX,
    paddingRight: spacing[10],
  },
  logo: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  logoText: { ...typography.title2, color: colors.text.default },
  bell: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radius.full,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { ...typography.micro, color: colors.text.inverse },
  errorBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[8],
    paddingHorizontal: layout.screenPaddingX,
    backgroundColor: colors.surface.default,
  },
  errorIcon: {
    width: 64,
    height: 64,
    marginBottom: spacing[8],
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTitle: { ...typography.title3, color: colors.text.default },
  errorDesc: { ...typography.body, color: colors.text.icon },
  errorButton: { alignSelf: 'center', marginTop: spacing[16] },
  trend: {
    position: 'absolute',
    top: spacing[12],
    left: layout.screenPaddingX,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    height: 44,
    paddingLeft: spacing[14],
    paddingRight: spacing[12],
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    boxShadow: `0 2px 10px ${colors.shadow}`,
  },
  trendText: { ...typography.bodyBold, color: colors.text.default },
  caption: {
    ...typography.caption,
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    color: colors.text.icon,
  },
  card: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: EMPTY_CARD_HEIGHT,
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[8],
    gap: spacing[18],
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    backgroundColor: colors.surface.white,
    boxShadow: `0 -2px 12px ${colors.shadow}`,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.gray[300],
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[16] },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { ...typography.title3, color: colors.text.default },
  cardDesc: { ...typography.caption, color: colors.text.icon },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing[8],
  },
});
