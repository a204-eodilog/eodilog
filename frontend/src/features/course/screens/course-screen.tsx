import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Spinner } from '@/components/ui/spinner';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorLook } from '@/api/error-look';
import { toApiError } from '@/api/errors';
import { AvatarGroup, ErrorState, Header, Icon, toast } from '@/components/ui';
import { useUndo } from '@/features/proposal/hooks/use-undo';
import { useTrip } from '@/features/trip/hooks/use-trip';
import { useMe } from '@/hooks/use-me';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { CourseDayList } from '../components/course-day-list';
import { CourseMap } from '../components/course-map';
import { DayTabs } from '../components/day-tabs';
import { RouteFailCard } from '../components/route-fail-card';
import {
  basisLine,
  dayCount,
  dayDate,
  dayLegs,
  appliedLine,
  editedLine,
  hasUnavailable,
  latestQueriedAt,
  noTimeDefault,
  toDraft,
  type CourseDraft,
  type DraftItem,
} from '../course-rules';
import { useItinerary } from '../hooks/use-itinerary';
import { useReconnected } from '../hooks/use-reconnected';
import { useRecalculate } from '../hooks/use-recalculate';

export type Person = { id: string; name: string; imageUrl: string | null; me: boolean };

export type CourseViewProps = {
  tripTitle?: string;
  people: Person[];
  status: 'loading' | 'error' | 'notFound' | 'ready';
  draft: CourseDraft | null;
  /** 일차 탭 아래 날짜. 기간이 없으면 null */
  startDate: string | null;
  /** "10.26(월) 세은님이 마지막으로 고쳤어요" */
  edited: string | null;
  /** 구간을 구하지 못한 것이 있으면 지난 기준 시각, 없으면 undefined */
  routeFail: { basis: string | null } | undefined;
  recalcBusy: boolean;
  onRecalculate(): void;
  /** 장소 [빼기]. S29 AI 변경안으로 간다 */
  onRemove(item: DraftItem): void;
  /** 방금 AI 변경안을 적용해 왔다. 동행에게 알렸다는 줄을 보인다(Figma 201-16198) */
  applied?: boolean;
  onEdit(): void;
  onRetry(): void;
  /** 불러오기 실패의 원인. 아이콘과 짧은 제목을 고른다 */
  error?: unknown;
  /** 미리보기용 처음 일차 */
  initialDay?: number;
};

/** S24 코스 모습(Figma 201-13969, 201-29705). 데이터는 CourseScreen이나 미리보기가 넘긴다 */
export function CourseView(props: CourseViewProps) {
  const { draft, people } = props;
  const [day, setDay] = useState(props.initialDay ?? 0);
  const insets = useSafeAreaInsets();
  const selected = draft ? Math.min(day, draft.days.length - 1) : 0;

  let body;
  if (props.status === 'loading' || (props.status === 'ready' && !draft)) {
    body = <Spinner style={styles.loading} color={colors.brand.primary} />;
  } else if (props.status === 'notFound') {
    body = (
      <ErrorState
        icon="lock"
        title="볼 수 없어요"
        description={null}
        retryLabel="돌아가기"
        onRetry={() => router.back()}
      />
    );
  } else if (props.status === 'error' || !draft) {
    body = <ErrorState {...errorLook(props.error)} description={null} onRetry={props.onRetry} />;
  } else {
    const items = draft.days[selected] ?? [];
    const legs = dayLegs(draft, selected);
    body = (
      <>
        <ScrollView contentContainerStyle={styles.scroll}>
          <CourseMap
            items={items}
            legs={legs}
            badges={[{ label: '저장됨', tone: 'saved' }]}
            tone="saved"
          />
          <View style={styles.content}>
            <DayTabs
              days={draft.days.map((_, i) => ({
                title: `${i + 1}일차`,
                sub: dayDate(props.startDate, i + 1),
              }))}
              selected={selected}
              onSelect={setDay}
            />
            {props.edited ? (
              <View style={styles.edited}>
                <Icon name="check" size={16} color={colors.status.success} />
                <Text style={[typography.caption, styles.editedText]} numberOfLines={1}>
                  {props.edited}
                </Text>
              </View>
            ) : null}
            {props.routeFail ? (
              <RouteFailCard
                basis={props.routeFail.basis}
                onRecalculate={props.onRecalculate}
                busy={props.recalcBusy}
              />
            ) : null}
            <CourseDayList
              items={items}
              legs={legs}
              mode="view"
              tone="saved"
              onRemove={(i) => {
                const item = items[i];
                if (item) props.onRemove(item);
              }}
            />
            {props.applied ? (
              <View style={styles.edited}>
                <Icon name="lock" size={16} color={colors.text.icon} />
                <Text style={[typography.caption, styles.appliedText]}>
                  바뀐 코스가 지금 코스예요. 동행에게 알렸어요
                </Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
        <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, spacing[16]) }]}>
          <Pressable style={styles.edit} onPress={props.onEdit} accessibilityRole="button">
            <Icon name="pencil" size={18} color={colors.text.default} />
            <Text style={[typography.bodyMedium, styles.editText]}>편집</Text>
          </Pressable>
        </View>
      </>
    );
  }

  return (
    <View style={styles.screen}>
      <Header
        title="코스"
        subtitle={props.tripTitle}
        subtitleIcon="trip"
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
    </View>
  );
}

/** S24 코스. S17 '코스' 메뉴로 오고, 코스가 비어 있으면 S23 코스 짜기로 바꿔 연다(가정 Q-6-5) */
export function CourseScreen() {
  const { tripId, applied } = useLocalSearchParams<{ tripId: string; applied?: string }>();
  const trip = useTrip(tripId);
  const me = useMe();
  const itinerary = useItinerary(tripId);
  // 코스 실시간 이벤트가 없어(Q-8-1) 끊긴 동안 동행이 바꾼 코스는 다시 연결될 때 받는다
  useReconnected(() => void itinerary.refetch());
  const recalc = useRecalculate(tripId);
  const undo = useUndo(tripId);
  // 적용하고 온 작업. 주소값은 알린 뒤 지우므로 처음 값을 따로 기억한다
  const [appliedJob, setAppliedJob] = useState(applied ?? null);
  // AI 변경안을 적용하고 왔으면 한 번만 알리고 [되돌리기]를 단다. 되돌리기는 이 알림에서만(Q-11-4)
  const notified = useRef(false);
  useEffect(() => {
    if (!appliedJob || notified.current || !itinerary.data) return;
    notified.current = true;
    toast.success('새 코스를 적용했어요', {
      action: {
        label: '되돌리기',
        onPress: () =>
          void undo(appliedJob).then((r) => {
            if (r === 'undone') setAppliedJob(null);
          }),
      },
    });
    // 다시 열거나 새로 고쳐도 알림이 또 뜨지 않게 주소값을 지운다
    router.setParams({ applied: undefined });
  }, [appliedJob, itinerary.data, undo]);

  const members = trip.data?.members ?? [];
  const people: Person[] = members
    .filter((m) => m.status === 'ACTIVE')
    .map((m) => ({
      id: m.id,
      name: m.user.nickname,
      imageUrl: m.user.profileImageUrl,
      me: m.user.id === me.data?.id,
    }));

  const data = itinerary.data;
  // 화면을 열 때 다시 받는 중이면 받아 둔 옛 코스로 빈 코스라고 정하지 않는다. 그 사이 동행이 만들었을 수 있다
  const empty = data !== undefined && data.items.length === 0 && !itinerary.isFetching;
  useEffect(() => {
    // 빈 코스면 코스 짜기로 바꿔 연다. 저장하면 S17이 아니라 S24로 돌아오도록 entry를 붙인다
    if (empty)
      router.replace({
        pathname: '/trips/[tripId]/course/edit',
        params: { tripId, entry: 'empty' },
      });
  }, [empty, tripId]);

  const days = dayCount(trip.data?.startDate ?? null, trip.data?.endDate ?? null);
  const draft = data && trip.data ? toDraft(data, days) : null;
  const editor = members.find((m) => m.id === data?.updatedByMemberId)?.user.nickname ?? '동행';
  // 경로 계산이 생기기 전에는 시간 없는 구간이 실패가 아니라 계산 전이라 실패 안내를 띄우지 않는다(Q-6-6)
  const failed = noTimeDefault() === 'failed' && data ? hasUnavailable(data) : false;
  const queried = data ? latestQueriedAt(data) : null;

  const notFound =
    toApiError(itinerary.error).status === 404 || toApiError(trip.error).status === 404;
  const status = notFound
    ? 'notFound'
    : data && !empty
      ? 'ready'
      : itinerary.isError
        ? 'error'
        : 'loading';

  return (
    <CourseView
      tripTitle={trip.data?.title}
      people={people}
      status={status}
      draft={draft}
      startDate={trip.data?.startDate ?? null}
      edited={
        data
          ? appliedJob
            ? appliedLine(data.updatedAt, editor)
            : editedLine(data.updatedAt, editor)
          : null
      }
      routeFail={failed ? { basis: queried ? basisLine(queried) : null } : undefined}
      recalcBusy={recalc.busy}
      onRecalculate={() => data && void recalc.start(data.version)}
      // 장소를 빼면 AI가 남은 일정을 다시 짠 변경안을 S29에서 비교한다(Q-11-2)
      onRemove={(item) =>
        router.push({
          pathname: '/trips/[tripId]/proposal',
          params: { tripId, removePlaceId: item.place.id },
        })
      }
      applied={appliedJob !== null}
      onEdit={() => router.push({ pathname: '/trips/[tripId]/course/edit', params: { tripId } })}
      onRetry={() => void itinerary.refetch()}
      error={itinerary.error ?? trip.error}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  // 로딩 동그라미를 남은 화면의 정중앙에 둔다
  loading: { flex: 1 },
  scroll: { paddingBottom: spacing[24] },
  content: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[16],
    gap: spacing[14],
  },
  edited: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  editedText: { color: colors.status.success, flexShrink: 1 },
  appliedText: { color: colors.text.icon, flexShrink: 1 },
  bottom: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: spacing[12],
    paddingHorizontal: layout.screenPaddingX,
    backgroundColor: colors.surface.white,
  },
  edit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    height: 48,
    paddingLeft: spacing[20],
    paddingRight: spacing[24],
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
  },
  editText: { color: colors.text.default },
});
