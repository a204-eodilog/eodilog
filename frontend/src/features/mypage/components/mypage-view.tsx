import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { findMapRegion } from '@/lib/korea-map';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { profileLine, tripListLine } from '../mypage-rules';
import type { MyPageSummary, MyTripPin } from '../types';

export type MyPageViewProps = {
  state: 'loading' | 'error' | 'empty' | 'ready';
  summary?: MyPageSummary;
  onRetry: () => void;
  onPreview: () => void;
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
        <ActivityIndicator style={styles.flex} color={colors.brand.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.profile}>
            <Avatar name={summary.nickname} imageUrl={summary.profileImageUrl} size={48} me />
            <View style={styles.profileText}>
              <Text style={styles.name} numberOfLines={1}>
                {summary.nickname}
              </Text>
              <Text style={styles.sub}>{profileLine(summary)}</Text>
            </View>
          </View>

          <Pressable
            onPress={props.onPreview}
            style={({ pressed }) => [styles.preview, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Icon name="eye" size={18} color={colors.brand.primaryDark} />
            <Text style={styles.previewText}>친구에게 보이는 모습</Text>
          </Pressable>

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

          {summary.tripCount > 0 ? (
            <Pressable
              onPress={props.onTrips}
              style={({ pressed }) => [styles.trips, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`내 여행 목록, ${tripListLine(summary)}`}
            >
              <View style={styles.tileIcon}>
                <Icon name="list" size={22} color={colors.brand.primary} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.tripsTitle}>내 여행 목록</Text>
                <Text style={styles.sub}>{tripListLine(summary)}</Text>
              </View>
              <Icon name="chevron-right" size={20} color={colors.text.muted} />
            </Pressable>
          ) : null}

          <View style={styles.tiles}>
            <Tile icon="clock" label="타임라인" onPress={props.onTimeline} />
            <Tile
              icon="people"
              label="친구"
              count={summary.friendCount === null ? null : `${summary.friendCount}명`}
              onPress={props.onFriends}
            />
            <Tile icon="gear" label="설정" onPress={props.onSettings} />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/** 내 여행 지도. 화면 안 카드라 손가락 확대는 끄고(세로 스크롤 우선) 핀만 누른다 */
function MapCard(props: MyPageViewProps & { summary: MyPageSummary }) {
  const empty = props.state === 'empty';
  const pins: KoreaMapPin[] = empty
    ? []
    : props.summary.pins.flatMap((p) => {
        const r = findMapRegion(p.regionCode);
        return r
          ? [
              {
                key: p.regionCode,
                point: r.point,
                anchor: 'bottom' as const,
                children: <TripPin pin={p} onPress={() => props.onPin(p)} />,
              },
            ]
          : [];
      });
  return (
    <View style={styles.mapCard}>
      <View
        style={[StyleSheet.absoluteFill, empty && styles.mapFaded]}
        pointerEvents={empty ? 'none' : 'box-none'}
      >
        <KoreaMap
          pins={pins}
          interactive={false}
          initialFocus={empty ? undefined : focusOn(props.summary.pins)}
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
            onPress={props.onNewTrip}
            leading={<Icon name="plus" size={18} color={colors.text.inverse} />}
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

/** 지도 핀. 게시한 여행은 파란 알약(사람 아이콘), 게시 전은 흰 알약(자물쇠) */
export function TripPin({ pin, onPress }: { pin: MyTripPin; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.pinWrap}
      accessibilityRole="button"
      accessibilityLabel={`${pin.label}, ${pin.posted ? '게시됨' : '나만 봐요'}`}
    >
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
      <View style={[styles.pinDot, pin.posted && styles.pinDotPosted]} />
    </Pressable>
  );
}

function Tile({
  icon,
  label,
  count,
  onPress,
}: {
  icon: IconName;
  label: string;
  count?: string | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={count ? `${label} ${count}` : label}
    >
      <View style={styles.tileIcon}>
        <Icon name={icon} size={20} color={colors.brand.primary} />
      </View>
      <Text style={styles.tileLabel}>
        {label}
        {count ? <Text style={styles.tileCount}> {count}</Text> : null}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
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
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing[14] },
  profileText: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...typography.title2, color: colors.text.default },
  sub: { ...typography.caption, color: colors.text.sub },
  preview: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
    height: 40,
    paddingHorizontal: spacing[14],
    borderRadius: radius.full,
    backgroundColor: colors.brand.primaryBg,
    marginTop: -spacing[4],
  },
  previewText: { ...typography.bodyBold, color: colors.brand.primaryDark },
  mapCard: {
    height: MAP_HEIGHT,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line.default,
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
  trips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[14],
    padding: spacing[18],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line.default,
    backgroundColor: colors.surface.white,
  },
  tripsTitle: { ...typography.bodyBold, color: colors.text.default },
  tiles: { flexDirection: 'row', gap: spacing[10] },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: spacing[10],
    paddingVertical: spacing[16],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line.default,
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.brand.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: { ...typography.captionBold, color: colors.text.default },
  tileCount: { ...typography.caption, color: colors.text.sub },
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
