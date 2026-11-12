import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Button,
  EmptyState,
  Icon,
  KoreaMap,
  type KoreaMapPin,
  MAP_MOTION,
  MAP_STAGES,
  type MapStage,
  MascotTraveler,
  pinEnterStartMs,
} from '@/components/ui';
import { Pop } from '@/components/ui/pop';
import { PressableScale } from '@/components/ui/pressable-scale';
import { SkeletonList } from '@/components/ui/skeleton';
import { findMapRegion, type MapPoint } from '@/lib/korea-map';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { clusterMarks, fillStepsFor, groupBySido, isGroup } from '../home-rules';
import type { HomeRecommendation, HomeState, RegionGroup, RegionMark } from '../types';

import { GroupPill, InviteSpot, LockedFace, RegionPill } from './map-pins';
import { RecommendSheet, SHEET_COLLAPSED } from './recommend-sheet';

export type HomeViewProps = {
  state: HomeState;
  marks: readonly RegionMark[];
  recommendations: readonly HomeRecommendation[];
  /** 추천 조회 상태. 불러오는 중이나 실패에 "좋아요를 누르면…" 안내를 보이지 않으려고 받는다 */
  recommendationsStatus?: 'loading' | 'error' | 'ready';
  unreadCount: number;
  /** '공개된 기록 없음' 안내의 친구 수. 모르면 null */
  friendCount: number | null;
  /** '공개된 기록 없음'에서 친구 얼굴을 놓을 지역. 서버가 주지 않아 미리보기에서만 쓴다 */
  lockedFriends?: readonly { name: string; regionCode: string }[];
  /** 처음 확대해서 볼 지역 (미리보기 '지도 확대') */
  initialZoom?: { regionCode: string; scale: number };
  initialSheetExpanded?: boolean;
  /**
   * S06 같은 지역 여행 목록 시트. 있으면 지역 핀(모든 단계)·사진 카드 단계의 묶음 핀을 눌렀을 때
   * 추천 시트 대신 이 시트를 연다. 닫으면 추천 시트로 돌아간다
   */
  renderRegionSheet?: (marks: readonly RegionMark[], onClose: () => void) => ReactNode;
  /**
   * 추천 시트를 내린다. 추천 장소를 눌러 N7(이어서 S08)을 열면 시트 위에 시트가 겹치지 않게
   * S06처럼 추천 시트 대신 보이게 한다. 닫으면 다시 올라온다
   */
  sheetHidden?: boolean;
  onRetry: () => void;
  onTrend: () => void;
  onBell: () => void;
  onFindFriends: () => void;
  onNewTrip: () => void;
  onRegion: (mark: RegionMark) => void;
  onRecommendation: (item: HomeRecommendation) => void;
};

// 핀이 화면에서 차지하는 크기(겹침 판단). 이름표 알약 + 점
const PILL_ROOM = { width: 86, height: 40 };
/** 이 단계부터 묶음 핀을 누르면 더 확대하지 않고 S06 시트를 연다 (0부터: 4단계) */
const SHEET_STAGE = 3;

/**
 * 그 단계에서 핀끼리 겹친다고 볼 거리(지도 좌표). 확대할수록 묶음이 풀리기만 하도록
 * 앞 단계들의 거리보다 커지지 않게 한다(사진 카드가 이름표보다 넓어도 다시 묶이지 않음)
 */
function roomInMap(index: number, pxPerUnit: number) {
  const fit = pxPerUnit / MAP_STAGES[index];
  let width = Infinity;
  let height = Infinity;
  for (let i = 1; i <= index; i += 1) {
    width = Math.min(width, PILL_ROOM.width / (fit * MAP_STAGES[i]));
    height = Math.min(height, PILL_ROOM.height / (fit * MAP_STAGES[i]));
  }
  return { width, height };
}

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
        <PressableScale
          onPress={props.onBell}
          style={styles.bell}
          accessibilityRole="button"
          accessibilityLabel={unreadCount > 0 ? `알림 ${unreadCount}개` : '알림'}
        >
          <Icon name="bell" size={24} color={colors.text.default} />
          {unreadCount > 0 ? (
            <Pop trigger={unreadCount} style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </Pop>
          ) : null}
        </PressableScale>
      </View>

      {state === 'loading' ? (
        <SkeletonList style={styles.flex} />
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
  const { state, marks, onRegion, lockedFriends } = props;
  const [stage, setStage] = useState<MapStage>();
  const [selectedMarks, setSelectedMarks] = useState<readonly RegionMark[] | null>(null);
  const [zoomTo, setZoomTo] = useState<{ key: number; point: MapPoint; scale: number }>();
  // 처음 등장 애니메이션이 끝나면, 확대하며 새로 생기는 핀은 기다리지 않고 바로 보인다
  const [entered, setEntered] = useState(false);
  // 적게 다녀간 곳부터 차례로 물들고, 핀도 같은 순서로 나타난다(Figma S05 모션)
  const fillSteps = useMemo(() => fillStepsFor(marks), [marks]);
  const order = useMemo(() => new Map(fillSteps.map((f, i) => [f.code, i])), [fillSteps]);
  const top = fillSteps[fillSteps.length - 1]?.code;
  useEffect(() => {
    const total =
      pinEnterStartMs(fillSteps.length) +
      fillSteps.length * MAP_MOTION.pinStaggerMs +
      MAP_MOTION.pinRiseMs;
    const t = setTimeout(() => setEntered(true), total);
    return () => clearTimeout(t);
  }, [fillSteps.length]);
  const index = stage?.index ?? 0;
  const nearLast = index >= SHEET_STAGE;
  // 처음에는 Figma 순서대로, 그 뒤 단계가 바뀌어 새로 생긴 핀은 바로 올라오며 나타난다
  const enterDelay = (code: string) =>
    entered
      ? 0
      : pinEnterStartMs(fillSteps.length) + (order.get(code) ?? 0) * MAP_MOTION.pinStaggerMs;
  // 묶음 핀을 누르면 그 자리로 한 단계 더 확대. 4·5단계에서는 묶인 지역 전체를 S06 시트로 연다
  const openGroup = (g: RegionGroup) => {
    if (nearLast && props.renderRegionSheet) {
      setSelectedMarks(g.marks);
      return;
    }
    const next = MAP_STAGES[index + 1];
    if (next === undefined) {
      onRegion(g.marks[0]);
      return;
    }
    setZoomTo((prev) => ({ key: (prev?.key ?? 0) + 1, point: g.point, scale: next + 0.1 }));
  };

  const pins = useMemo<KoreaMapPin[]>(() => {
    if (state === 'no-friends') {
      return INVITE_SPOTS.flatMap((code) => {
        const r = findMapRegion(code);
        return r ? [{ key: code, point: r.point, anchor: 'center', children: <InviteSpot /> }] : [];
      });
    }
    if (state === 'no-public') {
      return (lockedFriends ?? []).flatMap((f) => {
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
    // 1단계는 시도로 묶고, 2단계부터는 시군 이름표끼리 겹칠 때만 묶는다. 사진은 S06 시트에서 본다
    const items =
      index === 0 || !stage
        ? groupBySido(marks)
        : clusterMarks(marks, 1, roomInMap(index, stage.pxPerUnit));
    return items.flatMap((entry): KoreaMapPin[] => {
      if (!isGroup(entry)) {
        const item = entry;
        const r = findMapRegion(item.regionCode);
        if (!r) return [];
        const press = () => (props.renderRegionSheet ? setSelectedMarks([item]) : onRegion(item));
        return [
          {
            key: item.regionCode,
            point: r.point,
            anchor: 'bottom',
            enterDelayMs: enterDelay(item.regionCode),
            children: (
              <RegionPill
                mark={item}
                onPress={press}
                pulse={item.regionCode === top}
                pulseDelayMs={enterDelay(item.regionCode) + MAP_MOTION.pinRiseMs}
              />
            ),
          },
        ];
      }
      const item = entry;
      const last = item.marks.reduce((a, b) =>
        (order.get(b.regionCode) ?? 0) > (order.get(a.regionCode) ?? 0) ? b : a,
      );
      return [
        {
          key: item.key,
          point: item.point,
          anchor: 'bottom',
          enterDelayMs: enterDelay(last.regionCode),
          children: (
            <GroupPill
              group={item}
              pulse={item.marks.some((m) => m.regionCode === top)}
              pulseDelayMs={enterDelay(last.regionCode) + MAP_MOTION.pinRiseMs}
              onPress={() => openGroup(item)}
            />
          ),
        },
      ];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, marks, stage, onRegion, lockedFriends, fillSteps, order, top, entered]);

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
        onStageChange={setStage}
        focus={zoomTo}
        initialFocus={
          focus && props.initialZoom
            ? { point: focus.point, scale: props.initialZoom.scale }
            : undefined
        }
        inset={{ top: TREND_SPACE, bottom: bottomSpace }}
        creditBottom={bottomSpace + spacing[8]}
      />
      <PressableScale onPress={props.onTrend} style={styles.trend} accessibilityRole="button">
        <Icon name="trending" size={20} color={colors.brand.primary} />
        <Text style={styles.trendText}>요즘 뜨는 여행지</Text>
        <Icon name="chevron-right" size={16} color={colors.text.icon} />
      </PressableScale>
      {caption ? (
        <Text style={[styles.caption, { bottom: bottomSpace + spacing[32] }]} pointerEvents="none">
          {caption}
        </Text>
      ) : null}
      {selectedMarks && props.renderRegionSheet ? (
        props.renderRegionSheet(selectedMarks, () => setSelectedMarks(null))
      ) : props.sheetHidden ? null : ready ? (
        <RecommendSheet
          items={props.recommendations}
          status={props.recommendationsStatus ?? 'ready'}
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
              leading={<Icon name="person-plus" size={20} color={colors.text.inverse} />}
            />
          </>
        ) : (
          <>
            <Button
              label="친구 찾기"
              variant="text"
              onPress={props.onFindFriends}
              leading={<Icon name="person-plus" size={20} color={colors.brand.primary} />}
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
