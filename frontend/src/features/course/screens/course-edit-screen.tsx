import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { API_ERROR, toApiError } from '@/api/errors';
import { AvatarGroup, ConfirmSheet, ErrorState, Header, Icon, toast } from '@/components/ui';
import { pickPlace } from '@/features/place/place-picker';
import { updateTrip } from '@/features/trip/api';
import { invalidateTripLists } from '@/features/trip/hooks/trip-cache';
import { useRegions } from '@/features/trip/hooks/use-region-names';
import { shortRegionName } from '@/features/trip/trip-rules';
import { tripKey, useTrip } from '@/features/trip/hooks/use-trip';
import { formatTripPeriod } from '@/lib/format-date';
import { useMe } from '@/hooks/use-me';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { AutoFailView, AutoLoadingView } from '../components/auto-views';
import { CoeditConflict } from '../components/coedit-conflict';
import { CourseDayList } from '../components/course-day-list';
import { CourseMap, type MapBadge } from '../components/course-map';
import { DayTabs } from '../components/day-tabs';
import { ItemSheet } from '../components/item-sheet';
import { ManualBuilder } from '../components/manual-builder';
import { RegionSplit } from '../components/region-split';
import { ChooseView, NoDatesView, NoRegionView } from '../components/setup-views';
import { TransportChips } from '../components/transport-chips';
import {
  addPlace,
  basisLine,
  dayCount,
  dayDate,
  dayLegs,
  dayRegions,
  emptyDraft,
  latestQueriedAt,
  legLabel,
  moveItem,
  proposalToDraft,
  removeItem,
  replacePlace,
  setLegMode,
  toDraft,
  type CourseDraft,
  noTimeDefault,
  type NoTime,
} from '../course-rules';
import { rebaseDraft } from '../coedit-rules';
import { getItinerary } from '../api';
import { itineraryKey } from '../hooks/course-keys';
import { useAutoCourse } from '../hooks/use-auto-course';
import { useItinerary } from '../hooks/use-itinerary';
import { useReconnected } from '../hooks/use-reconnected';
import { useRecalculate } from '../hooks/use-recalculate';
import { useSaveItinerary } from '../hooks/use-save-itinerary';
import { useTripSavedPlaces } from '../hooks/use-saved-places';
import type { Itinerary, Place, TransportMode } from '../types';

import type { Person } from './course-screen';

let keySeq = 0;
/** 초안 안에서만 쓰는 새 칸 이름 */
export const newKey = () => `new-${Date.now().toString(36)}-${++keySeq}`;

/** 초안이 어디서 왔는지. 지도 위 표시가 달라진다 */
export type DraftOrigin = 'saved' | 'proposal' | 'manual';

export type DraftViewProps = {
  draft: CourseDraft;
  origin: DraftOrigin;
  dirty: boolean;
  startDate: string | null;
  /** 날짜 탭 아래 지역 이름. 여러 지역일 때만 */
  dayRegionNames?: string[];
  day: number;
  onSelectDay(day: number): void;
  selectedLeg: string | null;
  onSelectLeg(key: string): void;
  onChangeMode(mode: TransportMode): void;
  /** "10.26(월) 20:40 기준". 구한 적이 없으면 null */
  basis: string | null;
  onMore(index: number): void;
  sheetIndex: number | null;
  onCloseSheet(): void;
  onReplace(): void;
  onMove(delta: -1 | 1): void;
  onRemove(): void;
  onRecalculate(): void;
  onRedo(): void;
  onDone(): void;
  saving: boolean;
  /** 일차 탭 아래 날짜별 지역 줄 같은 덧붙임 */
  extra?: ReactNode;
  /** 시간이 없는 구간을 계산 전으로 볼지 실패로 볼지. 미리보기의 계산 불가 상태만 failed를 넘긴다 */
  noTime?: NoTime;
};

/** S23 코스 초안 모습(Figma 201-12879, 201-13071). 데이터는 화면이나 미리보기가 넘긴다 */
export function DraftView(props: DraftViewProps) {
  const { draft, day } = props;
  const insets = useSafeAreaInsets();
  const items = draft.days[day] ?? [];
  const legs = dayLegs(draft, day);
  const selected = legs.find((l) => l.key === props.selectedLeg) ?? legs[0] ?? null;
  const editing = props.dirty || props.sheetIndex !== null;
  // 경로를 못 구한 구간은 0분이나 직선거리로 채우지 않고 그렇게 알린다(Figma 201-13272)
  const noTime = props.noTime ?? noTimeDefault();
  const noRoute = noTime === 'failed' && legs.some((l) => legLabel(l) === null);
  const warning: MapBadge[] = noRoute
    ? [{ label: '두 곳 사이 경로를 찾지 못했어요', tone: 'warning' }]
    : [];
  const badges: MapBadge[] = editing
    ? [
        { label: '고치는 중', tone: 'editing' },
        { label: '저장하기 전까지 지금 코스는 그대로예요', tone: 'editing', icon: 'lock' },
      ]
    : props.origin === 'proposal'
      ? [{ label: '추천안', tone: 'draft' }]
      : [];
  badges.push(...warning);

  return (
    <>
      <ScrollView contentContainerStyle={styles.scroll}>
        <CourseMap items={items} legs={legs} badges={badges} tone="draft" />
        <View style={styles.content}>
          <DayTabs
            days={draft.days.map((_, i) => {
              const date = dayDate(props.startDate, i + 1);
              const region = props.dayRegionNames?.[i];
              return {
                title: `${i + 1}일차`,
                sub: [date, region].filter(Boolean).join(' · ') || null,
              };
            })}
            selected={day}
            onSelect={props.onSelectDay}
          />
          {props.extra}
          {legs.length > 0 ? (
            <>
              <TransportChips value={selected?.mode ?? null} onChange={props.onChangeMode} />
              <View style={styles.hint}>
                <Icon name="info" size={14} color={colors.text.sub} />
                <Text style={[typography.caption, styles.hintText]}>
                  {['구간을 누르면 이동 수단을 바꿔요', props.basis].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </>
          ) : null}
          {items.length === 0 ? (
            <Text style={[typography.body, styles.emptyDay]}>이 날은 아직 장소가 없어요</Text>
          ) : (
            <CourseDayList
              items={items}
              legs={legs}
              mode="edit"
              tone="draft"
              onMore={props.onMore}
              selectedLeg={selected?.key ?? null}
              onSelectLeg={props.onSelectLeg}
              onRecalculate={props.onRecalculate}
              noTime={noTime}
            />
          )}
          {noRoute ? (
            <View style={styles.hint}>
              <Icon name="info" size={14} color={colors.text.sub} />
              <Text style={[typography.caption, styles.hintText]}>이동 수단을 바꿔 보세요</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, spacing[16]) }]}>
        <Pressable
          style={[styles.pill, styles.redo]}
          onPress={props.onRedo}
          accessibilityRole="button"
        >
          <Icon name="refresh" size={18} color={colors.text.default} />
          <Text style={[typography.bodyMedium, styles.redoText]}>재추천</Text>
        </Pressable>
        <Pressable
          style={[styles.pill, styles.done, props.saving && styles.busy]}
          onPress={props.onDone}
          disabled={props.saving}
          accessibilityRole="button"
          accessibilityState={{ disabled: props.saving, busy: props.saving }}
        >
          {props.saving ? (
            <ActivityIndicator size="small" color={colors.text.inverse} />
          ) : (
            <Icon name="check" size={18} color={colors.text.inverse} />
          )}
          <Text style={[typography.bodyMedium, styles.doneText]}>완료</Text>
        </Pressable>
      </View>
      <ItemSheet
        target={
          props.sheetIndex !== null && items[props.sheetIndex]
            ? {
                name: items[props.sheetIndex].place.name,
                day,
                index: props.sheetIndex,
                count: items.length,
              }
            : null
        }
        onClose={props.onCloseSheet}
        onReplace={props.onReplace}
        onMove={props.onMove}
        onRemove={props.onRemove}
      />
    </>
  );
}

/** S23 코스 짜기. S24 [편집]이나 빈 코스에서 온다 */
export function CourseEditScreen() {
  const { tripId, entry, split } = useLocalSearchParams<{
    tripId: string;
    entry?: string;
    /** 투표 동률에서 [코스에서 날짜별로 나누기]로 왔을 때 1(가정 Q-6-4) */
    split?: string;
  }>();
  const trip = useTrip(tripId);
  const me = useMe();
  const itinerary = useItinerary(tripId);
  const saver = useSaveItinerary(tripId);

  const [draft, setDraft] = useState<CourseDraft | null>(null);
  const [origin, setOrigin] = useState<DraftOrigin>('saved');
  const [dirty, setDirty] = useState(false);
  const [day, setDay] = useState(0);
  const [selectedLeg, setSelectedLeg] = useState<string | null>(null);
  const [sheetIndex, setSheetIndex] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  /** setup: 여행지·기간 확인과 구성 방식 선택 / auto: 자동 추천 / manual: 직접 만들기 / draft: 코스 초안 */
  const [mode, setMode] = useState<'setup' | 'auto' | 'manual' | 'draft'>('draft');
  const [dates, setDates] = useState<{ start: string; end: string | null } | null>(null);
  const [savingDates, setSavingDates] = useState(false);
  const saved = useTripSavedPlaces(tripId, mode !== 'draft');
  const auto = useAutoCourse(tripId);
  const [autoFromDraft, setAutoFromDraft] = useState(false);
  const recalc = useRecalculate(tripId);
  /** 편집을 시작했거나 마지막으로 맞춘 저장 코스. 함께 편집에서 누가 어느 날을 고쳤는지 가리는 기준 */
  const [syncedFrom, setSyncedFrom] = useState<Itinerary | null>(null);
  /** 같은 날을 동행과 함께 고쳐 묻는 중인 최신 코스와 그 코스를 고친 동행(Figma 201-13453) */
  const [conflict, setConflict] = useState<{ latest: Itinerary; editor: string } | null>(null);
  const [overwriting, setOverwriting] = useState(false);
  const queryClient = useQueryClient();
  const regionIds = trip.data?.destinationRegionIds ?? [];
  const { regions } = useRegions(regionIds);
  const regionList = regionIds.map((id) => ({
    id,
    name: shortRegionName(regions.find((r) => r.id === id)?.name ?? ''),
  }));
  const regionNames = regionList.map((r) => r.name);
  /** 날짜마다 고른 지역 ID. 여행지가 두 곳 이상일 때만 쓴다 */
  const [dayRegion, setDayRegion] = useState<string[] | null>(null);
  const multiRegion = regionIds.length >= 2;

  const days = dayCount(trip.data?.startDate ?? null, trip.data?.endDate ?? null);
  const [started, setStarted] = useState(false);
  // 코스가 오면 처음 한 번 정한다(렌더 중 초기화). 비어 있으면 구성 방식 선택부터
  if (!started && itinerary.data && trip.data) {
    setStarted(true);
    setSyncedFrom(itinerary.data);
    if (itinerary.data.items.length > 0) setDraft(toDraft(itinerary.data, days));
    else if (split === '1' && regionIds.length >= 2) {
      // 투표 동률에서 왔으면 바로 날짜별 지역을 고르며 직접 만든다
      setDraft(emptyDraft(itinerary.data.version, days ?? 1));
      setOrigin('manual');
      setMode('manual');
    } else setMode('setup');
  }
  // 날짜별 지역 처음 값은 초안이 생긴 뒤 한 번 정한다
  if (multiRegion && draft && (!dayRegion || dayRegion.length !== draft.days.length)) {
    setDayRegion(dayRegions(draft, regionIds));
  }
  const nameOf = (id: string) => regionList.find((r) => r.id === id)?.name ?? '';
  const dayRegionNames = multiRegion && dayRegion ? dayRegion.map(nameOf) : undefined;
  const regionRow = (current: number) =>
    multiRegion && dayRegion ? (
      <RegionSplit
        day={current}
        regions={regionList}
        value={dayRegion[current] ?? ''}
        onChange={(id) => setDayRegion(dayRegion.map((r, i) => (i === current ? id : r)))}
      />
    ) : undefined;
  // 고치지 않은 저장 코스는 다시 받은 코스(다시 계산 뒤 등)로 맞춘다
  if (
    started &&
    itinerary.data &&
    itinerary.data !== syncedFrom &&
    mode === 'draft' &&
    origin === 'saved' &&
    !dirty &&
    itinerary.data.items.length > 0
  ) {
    setSyncedFrom(itinerary.data);
    setDraft(toDraft(itinerary.data, days));
  }

  const people: Person[] = (trip.data?.members ?? [])
    .filter((m) => m.status === 'ACTIVE')
    .map((m) => ({
      id: m.id,
      name: m.user.nickname,
      imageUrl: m.user.profileImageUrl,
      me: m.user.id === me.data?.id,
    }));

  /** 코스를 마지막으로 고친 동행을 부르는 말. "세은님", 모르거나 나간 동행이면 "다른 동행" */
  const editorName = (memberId: string | null | undefined) => {
    const name = people.find((p) => p.id === memberId && !p.me)?.name;
    return name ? `${name}님` : '다른 동행';
  };

  /** 내 변경을 버리고 최신 코스로 채운다 */
  const takeLatest = (latest: Itinerary) => {
    setSyncedFrom(latest);
    setDraft(toDraft(latest, days));
    setOrigin('saved');
    setDirty(false);
    setSelectedLeg(null);
  };

  /**
   * 다른 동행이 저장한 최신 코스와 내 초안을 처음 코스 기준으로 비교한다(spec Q-8-2, Q-8-3).
   * 서로 다른 날이면 내 날을 다시 얹고 알린다. 같은 날이면 확인 상자를 띄운다
   */
  const reconcile = (latest: Itinerary) => {
    if (!draft || !syncedFrom || latest.version === draft.baseVersion) return;
    const name = editorName(latest.updatedByMemberId);
    const result = rebaseDraft(toDraft(syncedFrom, days), draft, toDraft(latest, days));
    if (result.kind === 'overlap') {
      setConflict({ latest, editor: name });
    } else if (result.kind === 'none') {
      takeLatest(latest);
      toast.show('다른 동행이 먼저 코스를 고쳤어요. 최신 코스를 불러왔어요');
    } else {
      setSyncedFrom(latest);
      setDraft(result.draft);
      setDirty(true);
      setSelectedLeg(null);
      toast.show(
        result.theirDays.length > 0
          ? `${name}이 다른 날을 고쳐서 최신 코스에 내 변경을 다시 얹었어요. 확인하고 완료를 눌러 주세요`
          : `${name}이 먼저 저장해서 최신 코스에 내 변경을 다시 얹었어요. 확인하고 완료를 눌러 주세요`,
      );
    }
  };

  const change = (next: CourseDraft) => {
    setDraft(next);
    setDirty(true);
  };

  // 고친 것이나 아직 저장하지 않은 추천안·직접 만든 코스가 있으면 어떤 길로 나가도 버릴지 묻는다
  const unsaved = dirty || (mode === 'draft' && origin !== 'saved');
  /** 저장했거나 버리기로 해서 막지 않고 나가는 중. 어디로 갈지 */
  const [exitTo, setExitTo] = useState<'course' | 'back' | null>(null);
  usePreventRemove(unsaved && exitTo === null, () => setLeaving(true));
  useEffect(() => {
    if (exitTo === 'course') {
      // 폴더 첫 화면(course/index)은 pathname 객체를 타입 검사가 막아 실제 주소로 보낸다
      router.replace(`/trips/${tripId}/course`);
    } else if (exitTo === 'back') {
      if (router.canGoBack()) router.back();
      else router.replace(`/trips/${tripId}`);
    }
  }, [exitTo, tripId]);

  /**
   * 나갈 곳. 빈 코스에서 바꿔 열렸으면 뒤가 S17이다. 코스가 생겼으면 S24로 바꿔 가고,
   * 여전히 비었으면 S17로 돌아간다. S24로 가면 빈 코스라 곧바로 다시 여기로 열려 오가기만 한다
   */
  const exitFor = (hasCourse: boolean): 'course' | 'back' => {
    if (entry === 'empty') return hasCourse ? 'course' : 'back';
    return router.canGoBack() ? 'back' : 'course';
  };
  const savedHasCourse = (itinerary.data?.items.length ?? 0) > 0;

  const leave = () => setExitTo(exitFor(savedHasCourse));

  const done = async () => {
    if (!draft) return;
    const result = await saver.save(draft, itinerary.data);
    if (result.kind === 'saved') {
      setExitTo(exitFor(result.itinerary.items.length > 0));
    } else if (result.kind === 'unchanged') {
      setExitTo(exitFor(savedHasCourse));
    } else if (result.kind === 'conflict' && result.latest) {
      reconcile(result.latest);
    }
  };

  // 연결이 끊긴 동안 동행이 바꾼 코스를 놓치지 않게 다시 연결되면 최신 코스를 받는다(Q-8-1).
  // 고친 것이 없으면 받은 코스로 조용히 맞춰지고(위 맞추기), 고친 것이 있으면 같은 규칙으로 비교한다
  // 받는 사이 다시 그려졌으면(그 사이 고쳤거나 저장을 눌렀으면) 그때의 초안과 상태로 비교한다
  const live = useRef({ reconcile, dirty, origin, busy: false });
  useEffect(() => {
    live.current = { reconcile, dirty, origin, busy: saver.saving || conflict !== null };
  });
  useReconnected(() => {
    // 저장 중이면 저장 결과(409)가 같은 비교를 하므로 건너뛴다
    if (!draft || conflict || saver.saving) return;
    void queryClient
      .fetchQuery({
        queryKey: itineraryKey(tripId),
        queryFn: () => getItinerary(tripId),
        staleTime: 0,
      })
      .then((latest) => {
        const now = live.current;
        if (now.busy) return;
        if (now.dirty || now.origin !== 'saved') now.reconcile(latest);
      })
      .catch(() => undefined);
  });

  /** 확인 상자 [내 것으로 덮기]: 내가 고친 날만 내 것으로 덮고 바로 저장한다(Q-8-4) */
  const overwrite = async () => {
    if (!conflict || !draft || !syncedFrom) return;
    const { latest } = conflict;
    const r = rebaseDraft(toDraft(syncedFrom, days), draft, toDraft(latest, days), { force: true });
    const next = r.kind === 'overlap' ? draft : r.draft;
    setOverwriting(true);
    const result = await saver.save(next, latest);
    setOverwriting(false);
    setConflict(null);
    if (result.kind === 'saved') setExitTo(exitFor(result.itinerary.items.length > 0));
    else if (result.kind === 'unchanged') setExitTo(exitFor(savedHasCourse));
    // 그 사이 또 다른 동행이 저장했으면 같은 규칙을 한 번 더 적용한다
    else if (result.kind === 'conflict' && result.latest) reconcile(result.latest);
  };

  const replace = async () => {
    if (!draft || sheetIndex === null) return;
    const index = sheetIndex;
    const current = draft.days[day]?.[index];
    setSheetIndex(null);
    const picked: Place | null = await pickPlace({
      regionId: current?.place.regionId ?? undefined,
      ...(current
        ? { near: { latitude: current.place.latitude, longitude: current.place.longitude } }
        : {}),
    });
    if (picked) change(replacePlace(draft, day, index, picked, newKey()));
  };

  const startManual = () => {
    if (!itinerary.data) return;
    setDraft(emptyDraft(itinerary.data.version, days ?? 1));
    setOrigin('manual');
    setDay(0);
    setMode('manual');
  };

  /**
   * 자동 추천을 받아 추천안 초안으로 연다. 실패하면 실패 화면에 머문다.
   * 서버가 요청을 받기 전까지는 지금 화면을 두고 누른 버튼만 돌게 한다. 바로 실패하면 생성 중 화면 없이 실패 화면
   */
  const runAuto = async () => {
    const base = itinerary.data;
    if (!base) return;
    // 초안에서 재추천했으면 실패했을 때 그 초안으로 돌아갈 수 있게 기억한다. 실패 화면의 다시 시도는 그대로 둔다
    if (mode !== 'auto') setAutoFromDraft(mode === 'draft' && draft !== null);
    const content = await auto.start(base.version, () => setMode('auto'));
    if (!content) {
      setMode('auto');
      return;
    }
    setDraft(proposalToDraft(content, base.version, days, newKey));
    setOrigin('proposal');
    setDirty(false);
    setDay(0);
    setSelectedLeg(null);
    setMode('draft');
  };

  /** 기간 없음의 [다음]: 여행 기간을 저장하면 구성 방식 선택으로 넘어간다 */
  const saveDates = async () => {
    if (!trip.data || !dates?.end || savingDates) return;
    setSavingDates(true);
    try {
      const next = await updateTrip(tripId, {
        expectedVersion: trip.data.version,
        startDate: dates.start,
        endDate: dates.end,
      });
      queryClient.setQueryData(tripKey(tripId), next);
      invalidateTripLists(queryClient);
    } catch (e) {
      if (toApiError(e).code === API_ERROR.VERSION_CONFLICT) {
        toast.show('다른 동행이 먼저 여행을 고쳤어요. 최신 내용을 불러왔어요');
        void queryClient.invalidateQueries({ queryKey: tripKey(tripId), exact: true });
      } else {
        toast.error('기간을 저장하지 못했어요. 다시 시도해 주세요');
      }
    } finally {
      setSavingDates(false);
    }
  };

  const findPlace = async () => {
    if (!draft) return;
    const target = day;
    const picked = await pickPlace({ regionId: trip.data?.destinationRegionIds[0] });
    if (picked) change(addPlace(draft, target, picked, newKey()));
  };

  const sheetHandlers = (current: number, d: CourseDraft) => ({
    sheetIndex,
    onCloseSheet: () => setSheetIndex(null),
    onReplace: () => void replace(),
    onMove: (delta: -1 | 1) => {
      if (sheetIndex === null) return;
      change(moveItem(d, current, sheetIndex, delta));
      setSheetIndex(sheetIndex + delta);
    },
    onRemove: () => {
      if (sheetIndex === null) return;
      change(removeItem(d, current, sheetIndex));
      setSheetIndex(null);
    },
  });

  const notFound =
    toApiError(itinerary.error).status === 404 || toApiError(trip.error).status === 404;

  let body: ReactNode = null;
  if (notFound) {
    body = (
      <ErrorState
        title="여행을 찾을 수 없어요"
        description="나갔거나 지워진 여행일 수 있어요"
        retryLabel="돌아가기"
        onRetry={() => router.back()}
      />
    );
  } else if (itinerary.isError && !itinerary.data) {
    body = <ErrorState title="코스를 불러오지 못했어요" onRetry={() => void itinerary.refetch()} />;
  } else if (!itinerary.data || !trip.data) {
    body = <ActivityIndicator style={styles.loading} color={colors.brand.primary} />;
  } else if (mode === 'setup') {
    const regionName = regionNames.join('·');
    if (trip.data.destinationRegionIds.length === 0) {
      body = (
        <NoRegionView
          onPickRegion={() =>
            router.push({ pathname: '/trips/[tripId]/settings-region', params: { tripId } })
          }
        />
      );
    } else if (!trip.data.startDate || !trip.data.endDate) {
      body = (
        <NoDatesView
          regionName={regionName}
          value={dates}
          onChange={setDates}
          onNext={() => void saveDates()}
          saving={savingDates}
        />
      );
    } else {
      body = (
        <ChooseView
          regionName={regionName}
          period={formatTripPeriod(trip.data.startDate, trip.data.endDate)}
          savedCount={saved.data?.length ?? 0}
          onAuto={() => void runAuto()}
          onManual={startManual}
          autoBusy={auto.status === 'requesting'}
        />
      );
    }
  } else if (mode === 'auto') {
    body =
      auto.status === 'failed' || auto.status === 'requesting' ? (
        <AutoFailView
          onRetry={() => void runAuto()}
          onManual={autoFromDraft ? () => setMode('draft') : startManual}
          backToDraft={autoFromDraft}
          retrying={auto.status === 'requesting'}
        />
      ) : (
        <AutoLoadingView savedCount={saved.data?.length ?? 0} />
      );
  } else if (draft && mode === 'manual') {
    const current = Math.min(day, draft.days.length - 1);
    body = (
      <ManualBuilder
        draft={draft}
        startDate={trip.data.startDate}
        day={current}
        onSelectDay={setDay}
        saved={saved.data ?? []}
        onPlace={(place) => change(addPlace(draft, current, place, newKey()))}
        onFind={() => void findPlace()}
        onBuild={() => {
          setMode('draft');
          setOrigin('manual');
          setDay(0);
          setSelectedLeg(null);
        }}
        onMore={(d, i) => {
          setDay(d);
          setSheetIndex(i);
        }}
        dayRegionIds={multiRegion && dayRegion ? dayRegion : undefined}
        dayRegionNames={dayRegionNames}
        extra={regionRow(current)}
        {...sheetHandlers(current, draft)}
      />
    );
  } else if (draft) {
    const queried = latestQueriedAt(itinerary.data);
    const current = Math.min(day, draft.days.length - 1);
    body = (
      <DraftView
        draft={draft}
        origin={origin}
        dirty={dirty}
        startDate={trip.data.startDate}
        dayRegionNames={dayRegionNames}
        extra={regionRow(current)}
        day={current}
        onSelectDay={(d) => {
          setDay(d);
          setSelectedLeg(null);
        }}
        selectedLeg={selectedLeg}
        onSelectLeg={setSelectedLeg}
        onChangeMode={(mode) => {
          const legs = dayLegs(draft, current);
          const target = legs.find((l) => l.key === selectedLeg) ?? legs[0];
          if (target && target.mode !== mode) change(setLegMode(draft, target.key, mode));
        }}
        // 기준 시각은 저장된 코스의 구간 결과라 추천안·직접 만든 초안에는 붙이지 않는다
        basis={queried && origin === 'saved' ? basisLine(queried) : null}
        onMore={setSheetIndex}
        {...sheetHandlers(current, draft)}
        onRecalculate={() => {
          // 다시 계산은 저장된 코스에만 할 수 있다
          if (dirty || origin !== 'saved' || !itinerary.data) {
            toast.show('완료로 저장한 뒤 다시 계산할 수 있어요');
            return;
          }
          void recalc.start(itinerary.data.version);
        }}
        onRedo={() => void runAuto()}
        onDone={() => void done()}
        saving={saver.saving}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <Header
        title="코스 짜기"
        subtitle={trip.data?.title}
        subtitleIcon="trip"
        // 고친 것이나 아직 저장하지 않은 추천안·직접 만든 코스가 있으면 버릴지 묻는다
        onBack={() => (unsaved ? setLeaving(true) : leave())}
        right={
          people.length > 0 ? (
            <AvatarGroup
              people={people.map((p) => ({ name: p.name, imageUrl: p.imageUrl, me: p.me }))}
              max={3}
            />
          ) : undefined
        }
      />
      {body}
      <ConfirmSheet
        visible={leaving}
        onClose={() => setLeaving(false)}
        onConfirm={() => {
          setLeaving(false);
          setExitTo(exitFor(savedHasCourse));
        }}
        title="고친 내용을 버릴까요?"
        description="저장하지 않으면 지금 코스는 그대로예요"
        confirmLabel="버리고 나가기"
        cancelLabel="계속 고치기"
      />
      <CoeditConflict
        editor={conflict?.editor ?? null}
        busy={overwriting}
        onOverwrite={() => void overwrite()}
        onLatest={() => {
          if (conflict) takeLatest(conflict.latest);
          setConflict(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  loading: { marginTop: spacing[32] },
  scroll: { paddingBottom: spacing[24] },
  content: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[16],
    gap: spacing[14],
  },
  hint: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  hintText: { color: colors.text.sub, flexShrink: 1 },
  emptyDay: { color: colors.text.sub, paddingVertical: spacing[16] },
  bottom: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing[10],
    paddingTop: spacing[12],
    paddingHorizontal: layout.screenPaddingX,
    backgroundColor: colors.surface.white,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[8],
    height: 48,
    paddingLeft: spacing[20],
    paddingRight: spacing[24],
    borderRadius: radius.full,
  },
  redo: { backgroundColor: colors.surface.default },
  redoText: { color: colors.text.default },
  done: { backgroundColor: colors.brand.primary },
  doneText: { color: colors.text.inverse },
  busy: { opacity: 0.7 },
});
