import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { toApiError } from '@/api/errors';
import { AvatarGroup, ErrorState, Header, Icon, toast } from '@/components/ui';
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
  editedLine,
  hasUnavailable,
  latestQueriedAt,
  noTimeDefault,
  toDraft,
  type CourseDraft,
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
  onRemove(index: number): void;
  onEdit(): void;
  onRetry(): void;
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
    body = <ActivityIndicator style={styles.loading} color={colors.brand.primary} />;
  } else if (props.status === 'notFound') {
    body = (
      <ErrorState
        title="여행을 찾을 수 없어요"
        description="나갔거나 지워진 여행일 수 있어요"
        retryLabel="돌아가기"
        onRetry={() => router.back()}
      />
    );
  } else if (props.status === 'error' || !draft) {
    body = <ErrorState title="코스를 불러오지 못했어요" onRetry={props.onRetry} />;
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
              onRemove={props.onRemove}
            />
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
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const trip = useTrip(tripId);
  const me = useMe();
  const itinerary = useItinerary(tripId);
  // 코스 실시간 이벤트가 없어(Q-8-1) 끊긴 동안 동행이 바꾼 코스는 다시 연결될 때 받는다
  useReconnected(() => void itinerary.refetch());
  const recalc = useRecalculate(tripId);

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
  const empty = data !== undefined && data.items.length === 0;
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
      edited={data ? editedLine(data.updatedAt, editor) : null}
      routeFail={failed ? { basis: queried ? basisLine(queried) : null } : undefined}
      recalcBusy={recalc.busy}
      onRecalculate={() => data && void recalc.start(data.version)}
      // S29 AI 변경안(장소 빼기)은 11번 주제라 아직 없다
      onRemove={() => toast.show('준비 중이에요')}
      onEdit={() => router.push({ pathname: '/trips/[tripId]/course/edit', params: { tripId } })}
      onRetry={() => void itinerary.refetch()}
    />
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
  edited: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  editedText: { color: colors.status.success, flexShrink: 1 },
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
