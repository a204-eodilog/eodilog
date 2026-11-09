import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AvatarGroup, ErrorState, Header, Icon, toast } from '@/components/ui';
import {
  dayCount,
  dayLegs,
  latestQueriedAt,
  toDraft,
  type DayLeg,
  type DraftItem,
} from '@/features/course/course-rules';
import { useItinerary } from '@/features/course/hooks/use-itinerary';
import { useTrip } from '@/features/trip/hooks/use-trip';
import { useMe } from '@/hooks/use-me';
import { formatShortDate, parseDate } from '@/lib/format-date';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { TodayCourse, NoCourse } from '../components/today-course';
import { TripTools } from '../components/trip-tools';
import { WeatherCard } from '../components/weather-card';
import { useChecklistSummary, useWeather } from '../hooks/use-weather';
import {
  affectedIndex,
  clock,
  nextIndex,
  rainChance,
  tripPhase,
  type TripPhase,
} from '../on-trip-rules';
import type { Weather } from '../types';

export type OnTripViewProps = {
  tripTitle?: string;
  people: { name: string; imageUrl?: string | null; me?: boolean }[];
  status: 'loading' | 'ready' | 'error';
  phase: TripPhase;
  now: Date;
  onRetry(): void;
  /** 여행 중 */
  weather: Weather | null;
  weatherFailed: boolean;
  refreshing: boolean;
  onRefresh(): void;
  noPlace: boolean;
  affected: { time: string; name: string } | null;
  checklist: { total: number; checked: number } | null;
  items: readonly DraftItem[];
  legs: readonly DayLeg[];
  next: number | null;
  computedAt: string | null;
  onWeather(): void;
  onChecklist(): void;
  onAmenities(): void;
  onCourse(): void;
  /** 여행 시작 전 화면(201-14584) */
  before?: ReactNode;
};

/** 위 줄의 상태 알약과 날짜 */
function PhaseRow({ phase, now }: { phase: TripPhase; now: Date }) {
  const during = phase.kind === 'during' || phase.kind === 'after';
  const label =
    phase.kind === 'during' ? '여행 중' : phase.kind === 'after' ? '여행 끝' : '계획 중';
  let middle: string;
  if (during) {
    const date = parseDate(phase.date);
    middle = `${phase.day}일차${date ? ` · ${formatShortDate(date)}` : ''}`;
  } else if (phase.kind === 'before') {
    middle = `여행까지 ${phase.daysLeft}일 남았어요`;
  } else {
    middle = '여행 날짜를 정하면 여행 중으로 바뀌어요';
  }
  return (
    <View style={styles.phaseRow}>
      <View style={[styles.pill, phase.kind === 'during' ? styles.pillOn : styles.pillOff]}>
        <Icon
          name="map-pin"
          size={14}
          color={phase.kind === 'during' ? colors.text.inverse : colors.brand.primaryDark}
        />
        <Text
          style={[
            typography.captionMedium,
            phase.kind === 'during' ? styles.pillOnText : styles.pillOffText,
          ]}
        >
          {label}
        </Text>
      </View>
      <View style={styles.middle}>
        <Icon name="calendar" size={16} color={colors.brand.primaryDark} />
        <Text style={[typography.caption, styles.middleText]} numberOfLines={1}>
          {middle}
        </Text>
      </View>
      {during ? (
        <View style={styles.now}>
          <Icon name="clock" size={16} color={colors.text.icon} />
          <Text style={[typography.caption, styles.nowText]}>{`지금 ${clock(now)}`}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** S25 여행 중 표시만. 미리보기와 테스트가 서버 없이 그린다 */
export function OnTripView(props: OnTripViewProps) {
  const insets = useSafeAreaInsets();
  const during = props.phase.kind === 'during' || props.phase.kind === 'after';

  let body: ReactNode;
  if (props.status === 'loading') {
    body = <ActivityIndicator color={colors.brand.primary} style={styles.loading} />;
  } else if (props.status === 'error') {
    body = <ErrorState title="여행 중 화면을 불러오지 못했어요" onRetry={props.onRetry} />;
  } else {
    body = (
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing[24] }]}
      >
        <PhaseRow phase={props.phase} now={props.now} />
        {during ? (
          <>
            <WeatherCard
              weather={props.weather}
              failed={props.weatherFailed}
              refreshing={props.refreshing}
              onRefresh={props.onRefresh}
              affected={props.affected}
              onAlternatives={props.onWeather}
              noPlace={props.noPlace}
            />
            {props.items.length === 0 ? <NoCourse onMake={props.onCourse} /> : null}
            <TripTools
              rainChance={props.weather ? rainChance(props.weather) : null}
              checklist={props.checklist}
              onWeather={props.onWeather}
              onChecklist={props.onChecklist}
              onAmenities={props.onAmenities}
            />
            {props.items.length > 0 ? (
              <TodayCourse
                items={props.items}
                legs={props.legs}
                next={props.next}
                computedAt={props.computedAt}
                onCourse={props.onCourse}
              />
            ) : null}
          </>
        ) : (
          props.before
        )}
      </ScrollView>
    );
  }

  return (
    <View style={styles.screen}>
      <Header
        title="여행 중"
        subtitle={props.tripTitle}
        subtitleIcon="trip"
        right={props.people.length > 0 ? <AvatarGroup people={props.people} max={3} /> : undefined}
      />
      {body}
    </View>
  );
}

/** S25 여행 중. S17 '여행 중' 메뉴에서 연다 */
export function OnTripScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const trip = useTrip(tripId);
  const me = useMe();
  const itinerary = useItinerary(tripId);
  const checklist = useChecklistSummary(tripId);
  // '지금'과 다음 일정은 1분마다 다시 정한다
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const start = trip.data?.startDate ?? null;
  const end = trip.data?.endDate ?? null;
  const phase = tripPhase(start, end, now);
  const dayIndex = phase.kind === 'during' || phase.kind === 'after' ? phase.day - 1 : -1;
  const draft = itinerary.data ? toDraft(itinerary.data, dayCount(start, end)) : null;
  const items = draft && dayIndex >= 0 ? (draft.days[dayIndex] ?? []) : [];
  const legs = draft && dayIndex >= 0 ? dayLegs(draft, dayIndex) : [];
  const date = dayIndex >= 0 && 'date' in phase ? phase.date : null;
  const placeId = items[0]?.place.id ?? null;
  const weather = useWeather(tripId, date, placeId);
  const affected = weather.data ? affectedIndex(items, weather.data) : null;
  const queried = itinerary.data ? latestQueriedAt(itinerary.data) : null;

  const people = (trip.data?.members ?? [])
    .filter((m) => m.status === 'ACTIVE')
    .map((m) => ({
      name: m.user.nickname,
      imageUrl: m.user.profileImageUrl,
      me: m.user.id === me.data?.id,
    }));
  const status =
    trip.data && (itinerary.data || itinerary.isError)
      ? 'ready'
      : trip.isError
        ? 'error'
        : 'loading';

  return (
    <OnTripView
      tripTitle={trip.data?.title}
      people={people}
      status={status}
      phase={phase}
      now={now}
      onRetry={() => {
        void trip.refetch();
        void itinerary.refetch();
      }}
      weather={weather.data ?? null}
      weatherFailed={weather.isError}
      refreshing={weather.isFetching}
      onRefresh={() => void weather.refetch()}
      noPlace={!placeId}
      affected={
        affected !== null
          ? { time: items[affected].startTime ?? '', name: items[affected].place.name }
          : null
      }
      checklist={checklist.data ?? null}
      items={items}
      legs={legs}
      next={nextIndex(items, now)}
      computedAt={queried ? clock(queried) : null}
      // 날씨 대안은 그 날과 첫 장소로 연다
      onWeather={() =>
        router.push(`/trips/${tripId}/weather?date=${date ?? ''}&placeId=${placeId ?? ''}` as Href)
      }
      // 준비물 화면은 준비물 작업 브랜치에 있어 합치면 열린다(Q-10-5)
      onChecklist={() => router.push(`/trips/${tripId}/checklist` as Href)}
      onAmenities={() => toast.show('준비 중이에요')}
      onCourse={() => router.push(`/trips/${tripId}/course`)}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  loading: { marginTop: spacing[32] },
  content: { paddingHorizontal: layout.screenPaddingX, paddingTop: spacing[16], gap: spacing[20] },
  phaseRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[10] },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    height: 28,
    paddingHorizontal: spacing[12],
    borderRadius: radius.full,
  },
  pillOn: { backgroundColor: colors.brand.primary },
  pillOff: { backgroundColor: colors.brand.primaryLight },
  pillOnText: { color: colors.text.inverse },
  pillOffText: { color: colors.brand.primaryDark },
  middle: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  middleText: { flexShrink: 1, color: colors.brand.primaryDark },
  now: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing[6],
  },
  nowText: { color: colors.text.icon },
});
