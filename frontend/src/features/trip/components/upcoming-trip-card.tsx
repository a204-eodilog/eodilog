import { StyleSheet, Text, View } from 'react-native';

import { AvatarGroup, Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { formatRange } from '@/lib/seoul-date';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { useRegionNames } from '../hooks/use-region-names';
import { useTodayRoute } from '../hooks/use-today-places';
import {
  cardFooter,
  dayIndex,
  dDay,
  destinationLabel,
  nextTodoLabel,
  periodPlaceLabel,
  tripProgress,
  tripStatus,
} from '../trip-rules';
import type { Trip, TripStatus } from '../types';

// 단계 막대. 글 대신 막대로 지금 어디쯤인지 보인다(2026-11-05 사용자 요청: 글보다 아이콘·그림)
const STAGES: { key: TripStatus; label: string }[] = [
  { key: 'PLANNING', label: '계획 중' },
  { key: 'ONGOING', label: '여행 중' },
  { key: 'COMPLETED', label: '다녀옴' },
];

type Props = { trip: Trip; today: string; onPress: () => void };

/**
 * S15 맨 위 대표 여행 카드(B안 "지금 여행 집중", 2026-11-05 사용자 선택).
 * 밝은 상단 바 아래 따로 떨어진 파랑 카드다. 여백·둥글기는 채팅 탭 맨 위 카드(FeaturedRoomCard)와 맞춘다.
 * 여행 중이면 "여행 중 · N일차", 아니면 "다가오는 여행 · D-N"
 */
export function UpcomingTripCard({ trip, today, onPress }: Props) {
  const place = destinationLabel(useRegionNames(trip.destinationRegionIds));
  const d = dDay(trip, today);
  const n = dayIndex(trip, today);
  // 서버 status 대신 날짜로 정한다. 화면을 열어 둔 채 자정이 지나도 맞게 바뀐다
  const status = tripStatus(trip, today);
  const ongoing = status === 'ONGOING';
  const stageIndex = STAGES.findIndex((s) => s.key === status);
  const progress = tripProgress(trip, today);
  // 여행 중이면 오늘 갈 곳. 코스가 있으면 날짜 막대 대신 오늘 코스를 보인다(지금 가장 쓸모 있는 정보).
  // 받는 동안은 날짜 막대를 먼저 그리지 않고 오늘 코스 자리만 잡아 둔다
  const todayRoute = useTodayRoute(trip.id, n);
  const footer = cardFooter({ ongoing: progress !== null, ...todayRoute });
  const kicker = ongoing
    ? `여행 중${n !== null ? ` · ${n}일차` : ''}`
    : `다가오는 여행${d !== null ? ` · D-${d}` : ''}`;
  const range = trip.startDate && trip.endDate ? formatRange(trip.startDate, trip.endDate) : null;
  const periodPlace = periodPlaceLabel(range, place);

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${kicker} ${trip.title}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.head}>
        <Text style={[typography.captionMedium, styles.kicker]}>{kicker}</Text>
        <View style={styles.titleRow}>
          <Text style={[typography.title2, styles.white, styles.titleText]} numberOfLines={2}>
            {trip.title}
          </Text>
          <AvatarGroup
            people={trip.members.map((m) => ({
              name: m.user.nickname,
              imageUrl: m.user.profileImageUrl,
            }))}
            size="md"
          />
        </View>
        {periodPlace ? (
          <Text style={[typography.subMedium, styles.kicker]} numberOfLines={1}>
            {periodPlace}
          </Text>
        ) : null}
      </View>

      <View style={styles.todo}>
        <Icon name="map-pin" size={20} color={colors.brand.primary} />
        <View style={styles.todoText}>
          <Text style={[typography.captionMedium, styles.todoKicker]}>지금 할 일</Text>
          <Text style={[typography.bodyBold, styles.todoLabel]}>{nextTodoLabel(trip, today)}</Text>
        </View>
        <Icon name="chevron-right" size={16} color={colors.text.muted} />
      </View>

      {footer === 'route' && todayRoute.places ? (
        <TodayRoute places={todayRoute.places} />
      ) : footer === 'routeLoading' ? (
        <TodayRouteLoading />
      ) : footer === 'days' && progress ? (
        <DayProgress day={progress.day} total={progress.total} />
      ) : (
        <StageSteps index={stageIndex} />
      )}
    </PressableScale>
  );
}

/** 오늘 코스에서 이름을 보일 곳 수. 넘치면 "+N" */
const ROUTE_SHOWN = 3;

/**
 * 오늘 코스 한 줄. 여행 중이고 오늘 갈 곳이 있을 때 보인다.
 * "오늘 3곳" 아래에 갈 순서대로 번호 동그라미와 이름을 잇는다. 넷째부터는 "+N"으로 줄인다
 */
function TodayRoute({ places }: { places: readonly string[] }) {
  const shown = places.slice(0, ROUTE_SHOWN);
  const more = places.length - shown.length;
  return (
    <View
      style={styles.route}
      accessible
      accessibilityLabel={`오늘 ${places.length}곳, ${places.join(', ')}`}
    >
      <Text style={[typography.captionBold, styles.white]}>오늘 {places.length}곳</Text>
      <View style={styles.stops}>
        {shown.map((name, i) => (
          <View key={`${i}-${name}`} style={styles.stop}>
            {i > 0 ? <View style={styles.link} /> : null}
            <View style={styles.stopNo}>
              <Text style={[typography.micro, styles.stopNoText]}>{i + 1}</Text>
            </View>
            <Text style={[typography.caption, styles.white, styles.stopName]} numberOfLines={1}>
              {name}
            </Text>
          </View>
        ))}
        {more > 0 ? <Text style={[typography.captionBold, styles.soft]}>+{more}</Text> : null}
      </View>
    </View>
  );
}

/**
 * 오늘 코스를 받는 동안의 자리 표시. 오늘 코스 한 줄과 같은 높이라 코스가 도착해도 카드가 움직이지 않는다
 */
function TodayRouteLoading() {
  return (
    <View style={styles.route} accessible accessibilityLabel="오늘 코스를 불러오는 중">
      <View style={styles.loadingTitle}>
        <View style={[styles.loadingBar, styles.loadingBarTitle]} />
      </View>
      <View style={styles.loadingStops}>
        <View style={[styles.loadingBar, styles.loadingBarStops]} />
      </View>
    </View>
  );
}

/** 하루를 한 칸으로 그리는 한도. 이보다 긴 여행은 이어진 막대 하나로 그린다 */
const MAX_DAY_CELLS = 10;

/**
 * 여행 진행. 여행 중일 때 가장 중요한 것 하나, 며칠 가운데 몇째 날인지만 한 줄로 보인다.
 * 왼쪽에 하루 한 칸짜리 막대(지난 날과 오늘은 흰색), 오른쪽에 "2 / 3일"
 */
function DayProgress({ day, total }: { day: number; total: number }) {
  const cells = total <= MAX_DAY_CELLS;
  return (
    <View
      style={styles.progress}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`여행 진행, ${total}일 중 ${day}일차`}
      accessibilityValue={{ min: 0, max: total, now: day }}
    >
      {cells ? (
        <View style={styles.cells}>
          {Array.from({ length: total }, (_, i) => (
            <View key={i} style={[styles.cellBar, i < day && styles.cellOn]} />
          ))}
        </View>
      ) : (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.min(100, (day / total) * 100)}%` }]} />
        </View>
      )}
      <Text style={[typography.captionBold, styles.white]}>
        {day} / {total}일
      </Text>
    </View>
  );
}

/**
 * 여행 단계. 계획 중 → 여행 중 → 다녀옴 가운데 지금 어디인지.
 * 전에는 막대 세 개만 있어 무슨 뜻인지 알 수 없었다. 막대마다 이름을 붙인다
 */
function StageSteps({ index }: { index: number }) {
  return (
    <View
      style={styles.stages}
      accessible
      accessibilityLabel={`단계 ${STAGES[index]?.label ?? ''}`}
    >
      {STAGES.map((s, i) => (
        <View key={s.key} style={styles.stageCell}>
          <View style={[styles.stage, i <= index && styles.stageOn]} />
          <Text
            style={[
              i === index ? typography.captionBold : typography.caption,
              i === index ? styles.white : styles.soft,
            ]}
          >
            {s.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // 채팅 탭 맨 위 카드와 같은 좌우 20·둥글기 xl·안쪽 16. 묶음 사이 16
  card: {
    marginHorizontal: layout.screenPaddingX,
    padding: spacing[16],
    gap: spacing[16],
    borderRadius: radius.xl,
    backgroundColor: colors.brand.primary,
  },
  pressed: { opacity: 0.9 },
  head: { gap: spacing[4] },
  kicker: { color: colors.onBrand.textSoft },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[12] },
  titleText: { flex: 1 },
  white: { color: colors.text.inverse },
  // 지금 할 일: 흰 상자 둥글기 16, 안쪽 왼 18·오른 14·위아래 14, 간격 18
  todo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[18],
    paddingLeft: spacing[18],
    paddingRight: spacing[14],
    paddingVertical: spacing[14],
    borderRadius: radius.lg,
    backgroundColor: colors.surface.white,
  },
  todoText: { flex: 1 },
  todoKicker: { color: colors.text.default },
  todoLabel: { color: colors.text.default },
  soft: { color: colors.onBrand.textSoft },
  // 오늘 코스. 제목 한 줄 아래에 번호 동그라미와 이름이 옆으로 이어진다
  route: { gap: spacing[8] },
  stops: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  // 이름이 길면 줄어들어 말줄임. 세 곳이 한 줄에 들어간다
  stop: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  link: { width: 10, height: 2, borderRadius: 1, backgroundColor: colors.onBrand.chip },
  stopNo: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.white,
  },
  stopNoText: { color: colors.brand.primary },
  stopName: { flexShrink: 1 },
  // 받는 중 자리 표시. 제목 줄(20)과 장소 줄(20) 높이를 오늘 코스와 맞춘다
  loadingTitle: { height: 20, justifyContent: 'center' },
  loadingStops: { height: 20, justifyContent: 'center' },
  loadingBar: { height: 8, borderRadius: radius.full, backgroundColor: colors.onBrand.chip },
  loadingBarTitle: { width: 56 },
  loadingBarStops: { width: '70%' },
  // 여행 진행(여행 중). 막대와 숫자가 한 줄
  progress: { flexDirection: 'row', alignItems: 'center', gap: spacing[12] },
  cells: { flex: 1, flexDirection: 'row', gap: spacing[4] },
  cellBar: { flex: 1, height: 6, borderRadius: radius.full, backgroundColor: colors.onBrand.chip },
  cellOn: { backgroundColor: colors.surface.white },
  track: { flex: 1, height: 6, borderRadius: radius.full, backgroundColor: colors.onBrand.chip },
  fill: { height: 6, borderRadius: radius.full, backgroundColor: colors.surface.white },
  // 여행 단계(계획 중). 막대 아래에 이름
  stages: { flexDirection: 'row', gap: spacing[4] },
  stageCell: { flex: 1, gap: spacing[6] },
  stage: { height: 4, borderRadius: radius.full, backgroundColor: colors.onBrand.chip },
  stageOn: { backgroundColor: colors.surface.white },
});
