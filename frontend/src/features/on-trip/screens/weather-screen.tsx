import { SCROLL_DECELERATION } from '@/theme/scroll';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Spinner } from '@/components/ui/spinner';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorLook } from '@/api/error-look';
import { AvatarGroup, Button, Header, Icon, toast, type IconName } from '@/components/ui';
import { dayCount, toDraft, type DraftItem } from '@/features/course/course-rules';
import { useItinerary } from '@/features/course/hooks/use-itinerary';
import { tripKey, useTrip } from '@/features/trip/hooks/use-trip';
import { useMe } from '@/hooks/use-me';
import { parseDate } from '@/lib/format-date';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { addChecklistItem } from '../api';
import {
  AffectedRow,
  AlternativeList,
  NoAlternative,
  ProposalSheet,
} from '../components/alternative-list';
import { WeatherSummary } from '../components/weather-card';
import { useWeather } from '../hooks/use-weather';
import { useWeatherAlternatives } from '../hooks/use-weather-alternatives';
import { affectedIndex, alternativeView, isoDate } from '../on-trip-rules';
import type { Weather, WeatherAlternative } from '../types';

export type WeatherViewProps = {
  tripTitle?: string;
  people: { name: string; imageUrl?: string | null; me?: boolean }[];
  weather: Weather | null;
  weatherFailed: boolean;
  refreshing: boolean;
  onRefresh(): void;
  affected: { index: number; time: string | null; name: string } | null;
  /** 대안 작업 */
  phase: 'idle' | 'running' | 'done' | 'failed';
  alternatives: readonly WeatherAlternative[];
  onRetryAlternatives(): void;
  selectedId: string | null;
  onSelect(id: string): void;
  making: boolean;
  onMake(): void;
  /** 대안 없음의 [준비물에 넣기] */
  adding: boolean;
  added: boolean;
  onAddChecklist(): void;
  /** 변경안 결과 시트 */
  sheet?: ReactNode;
  /**
   * 대안을 찾을 수 없는 까닭. 볼 장소가 없거나 코스를 받지 못했으면 기다림 표시 대신 이것을 보인다.
   * onRetry가 있으면 다시 시도
   */
  /** 대안을 찾을 수 없는 까닭. 아이콘과 짧은 제목만 보인다 */
  blocked?: { icon: IconName; title: string; onRetry?: () => void } | null;
};

/** S26 날씨 대안 표시만. 미리보기와 테스트가 서버 없이 그린다 */
export function WeatherView(props: WeatherViewProps) {
  const insets = useSafeAreaInsets();
  const empty = props.phase === 'done' && props.alternatives.length === 0;
  let list: ReactNode;
  if (props.blocked) {
    const { icon, title, onRetry } = props.blocked;
    list = (
      <View style={styles.center}>
        <View style={styles.failBadge}>
          <Icon name={icon} size={24} color={colors.text.icon} />
        </View>
        <Text style={[typography.bodyBold, styles.title]}>{title}</Text>
        {onRetry ? <Button label="다시 시도" variant="secondary" onPress={onRetry} /> : null}
      </View>
    );
  } else if (props.phase === 'running' || props.phase === 'idle') {
    list = (
      <View style={styles.center}>
        <Spinner color={colors.brand.primary} />
        <Text style={[typography.body, styles.sub]}>날씨 대안을 찾고 있어요</Text>
      </View>
    );
  } else if (props.phase === 'failed') {
    list = (
      <View style={styles.center}>
        <View
          style={styles.failBadge}
          accessible
          accessibilityRole="alert"
          accessibilityLabel="날씨 대안을 만들지 못했어요"
        >
          <Icon name="alert" size={24} color={colors.text.icon} />
        </View>
        <Button
          label="다시 시도"
          icon="refresh"
          variant="secondary"
          onPress={props.onRetryAlternatives}
        />
      </View>
    );
  } else if (empty) {
    list = <NoAlternative onAdd={props.onAddChecklist} busy={props.adding} added={props.added} />;
  } else {
    list = (
      <AlternativeList
        alternatives={props.alternatives}
        weather={props.weather}
        selectedId={props.selectedId}
        onSelect={props.onSelect}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <Header
        title="날씨 대안"
        subtitle={props.tripTitle}
        subtitleIcon="trip"
        right={props.people.length > 0 ? <AvatarGroup people={props.people} max={3} /> : undefined}
      />
      <ScrollView
        decelerationRate={SCROLL_DECELERATION}
        contentContainerStyle={[styles.content, { paddingBottom: spacing[32] }]}
      >
        <View style={styles.card}>
          <WeatherSummary
            weather={props.weather}
            failed={props.weatherFailed}
            refreshing={props.refreshing}
            onRefresh={props.onRefresh}
          />
          {props.affected ? (
            <AffectedRow
              index={props.affected.index}
              time={props.affected.time}
              name={props.affected.name}
            />
          ) : null}
        </View>
        {empty ? null : (
          <View style={styles.head}>
            <Text style={[typography.title3, styles.title]}>대신 이렇게 해 볼까요?</Text>
            {props.affected ? (
              <Text style={[typography.caption, styles.sub]}>{`${props.affected.name} 근처`}</Text>
            ) : null}
          </View>
        )}
        {list}
      </ScrollView>
      {props.phase === 'done' && !empty ? (
        <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing[12] }]}>
          <Button
            label="변경안 만들기"
            icon="route"
            weight="medium"
            disabled={!props.selectedId}
            loading={props.making}
            onPress={props.onMake}
          />
        </View>
      ) : null}
      {props.sheet}
    </View>
  );
}

/** "1일차 오전 일정" */
function scopeOf(day: number | null, time: string | null): string {
  const half = time && Number(time.slice(0, 2)) >= 12 ? '오후' : '오전';
  return `${day ? `${day}일차 ` : ''}${half} 일정`;
}

/** 고른 대안이 바꾸는 일정의 이전과 이후 */
function changeOf(alt: WeatherAlternative | undefined, items: readonly DraftItem[]) {
  if (!alt) return { from: null, to: null };
  const item = items.find((i) => i.id === alt.itemId) ?? null;
  const from = item ? { time: item.startTime, name: item.place.name } : null;
  if (alt.type === 'TIME_SHIFT') {
    return { from, to: { time: alt.targetStartTime, name: item?.place.name ?? alt.activity } };
  }
  return {
    from,
    to: {
      time: item?.startTime ?? null,
      name: alt.place?.name ?? alternativeView(alt, null).title,
    },
  };
}

/** S26 날씨 대안. S25 [날씨 대안 보기]와 도구 '날씨 대안'에서 그 날과 첫 장소로 연다 */
export function WeatherScreen() {
  const { tripId, date, placeId } = useLocalSearchParams<{
    tripId: string;
    date: string;
    placeId: string;
  }>();
  const queryClient = useQueryClient();
  const trip = useTrip(tripId);
  const me = useMe();
  const itinerary = useItinerary(tripId);
  const weather = useWeather(tripId, date || null, placeId || null);
  const alts = useWeatherAlternatives(tripId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  const start = trip.data?.startDate ?? null;
  const end = trip.data?.endDate ?? null;
  const s = parseDate(start);
  const d = parseDate(date);
  const day = s && d ? Math.round((d.getTime() - s.getTime()) / 86_400_000) + 1 : null;
  const draft = itinerary.data ? toDraft(itinerary.data, dayCount(start, end)) : null;
  const items = draft && day ? (draft.days[day - 1] ?? []) : [];
  const shown = alts.result?.weather ?? weather.data ?? null;
  // 오늘 화면이면 이미 지난 일정은 건너뛴다
  const today = isoDate(new Date()) === date;
  const affected = shown ? affectedIndex(items, shown, today ? new Date() : undefined) : null;

  // 코스를 받으면 그 version으로 한 번 날씨 대안을 만든다
  const version = itinerary.data?.version ?? null;
  const begin = alts.start;
  const started = useRef(false);
  useEffect(() => {
    if (started.current || version === null || !date || !placeId) return;
    started.current = true;
    void begin(date, placeId, version);
  }, [begin, version, date, placeId]);

  const selected = alts.result?.alternatives.find((a) => a.alternativeId === selectedId);
  const change = changeOf(selected, items);

  const people = (trip.data?.members ?? [])
    .filter((m) => m.status === 'ACTIVE')
    .map((m) => ({
      name: m.user.nickname,
      imageUrl: m.user.profileImageUrl,
      me: m.user.id === me.data?.id,
    }));

  const make = async () => {
    if (!selectedId) return;
    const ok = await alts.makeProposal(selectedId);
    if (!ok) toast.error('변경안을 만들지 못했어요. 다시 시도해 주세요');
  };

  // 우산과 우비를 준비물에 넣는다. 하나라도 실패하면 알린다
  const addChecklist = async () => {
    setAdding(true);
    try {
      await addChecklistItem(tripId, '우산');
      await addChecklistItem(tripId, '우비');
      setAdded(true);
      toast.success('우산과 우비를 준비물에 넣었어요');
      void queryClient.invalidateQueries({ queryKey: [...tripKey(tripId), 'checklist'] });
    } catch {
      toast.error('준비물에 넣지 못했어요. 다시 시도해 주세요');
    } finally {
      setAdding(false);
    }
  };

  return (
    <WeatherView
      tripTitle={trip.data?.title}
      people={people}
      weather={shown}
      weatherFailed={weather.isError}
      refreshing={weather.isFetching}
      onRefresh={() => void weather.refetch()}
      affected={
        affected !== null
          ? { index: affected, time: items[affected].startTime, name: items[affected].place.name }
          : null
      }
      phase={alts.phase}
      blocked={
        !date || !placeId
          ? { icon: 'map-pin', title: '날씨 대안을 찾을 장소가 없어요' }
          : itinerary.isError && !itinerary.data
            ? { ...errorLook(itinerary.error), onRetry: () => void itinerary.refetch() }
            : null
      }
      alternatives={alts.result?.alternatives ?? []}
      onRetryAlternatives={() => {
        if (version !== null && date && placeId) void begin(date, placeId, version);
      }}
      selectedId={selectedId}
      onSelect={setSelectedId}
      making={alts.proposal.phase === 'running'}
      onMake={() => void make()}
      adding={adding}
      added={added}
      onAddChecklist={() => void addChecklist()}
      sheet={
        <ProposalSheet
          visible={alts.proposal.phase === 'done'}
          scope={scopeOf(day, change.from?.time ?? null)}
          from={change.from}
          to={change.to}
          onClose={alts.closeProposal}
          // 만든 변경안을 S29에서 비교하고 적용한다
          onView={() => {
            const id = alts.proposal.jobId;
            alts.closeProposal();
            if (id)
              router.push({ pathname: '/trips/[tripId]/proposal', params: { tripId, jobId: id } });
          }}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  content: { paddingHorizontal: layout.screenPaddingX, paddingTop: spacing[16], gap: spacing[24] },
  card: {
    gap: spacing[18],
    padding: spacing[20],
    borderRadius: radius.xl,
    backgroundColor: colors.surface.default,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.text.default },
  sub: { color: colors.text.icon },
  center: { alignItems: 'center', gap: spacing[12], paddingVertical: spacing[32] },
  failBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottom: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: spacing[12],
    paddingHorizontal: layout.screenPaddingX,
  },
});
