import { SCROLL_DECELERATION } from '@/theme/scroll';
import { Image } from 'expo-image';
import { Fragment, useRef, useState, type Key } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Stagger } from '@/components/ui/stagger';
import { AvatarGroup, Chip, ErrorState, Header, Icon, type IconName } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { SkeletonList } from '@/components/ui/skeleton';
import { assetSource } from '@/lib/asset-image';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { membersLabel, minutesLabel, wonShort } from '../feed-rules';
import type { FeedDetail, FeedStop, TransportKind } from '../types';

import { RouteMap } from './route-map';

export type FeedDetailViewProps = {
  state: 'loading' | 'error' | 'ready';
  detail?: FeedDetail;
  onRetry: () => void;
  onLike: () => void;
  /** 사진을 누르면 그 사진부터 크게 본다 */
  onPhotos: (index: number) => void;
  onSavePlace: (stop: FeedStop) => void;
  onPlace: (stop: FeedStop) => void;
  /** 내가 이미 저장한 장소의 id. 그 줄의 책갈피를 채워 보인다. 없으면 모두 빈 책갈피 */
  savedPlaceIds?: ReadonlySet<string>;
};

const SECTIONS = [
  { key: 'photos', label: '사진' },
  { key: 'route', label: '경로' },
  { key: 'places', label: '장소' },
  { key: 'expense', label: '경비' },
] as const;
type SectionKey = (typeof SECTIONS)[number]['key'];

/** 섹션이 들어 있는 Stagger 칸의 key. 경로와 장소는 한 칸(days)에 같이 있다 */
const ITEM_OF: Record<SectionKey, string> = {
  photos: 'photos',
  route: 'days',
  places: 'days',
  expense: 'expense',
};

const MODE_ICON: Record<TransportKind, IconName> = {
  walk: 'walk',
  car: 'car',
  transit: 'bus',
  other: 'route',
};

/** S07 친구 여행 상세(공동 피드). 값과 동작은 모두 props로 받는다(실제 화면·미리보기 공용) */
export function FeedDetailView(props: FeedDetailViewProps) {
  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
      <Header />
      {props.state === 'loading' || !props.detail ? (
        props.state === 'error' ? (
          <ErrorState title="여행을 불러오지 못했어요" onRetry={props.onRetry} />
        ) : (
          <SkeletonList style={styles.flex} />
        )
      ) : (
        <Body {...props} detail={props.detail} />
      )}
    </SafeAreaView>
  );
}

function Body({ detail, ...props }: FeedDetailViewProps & { detail: FeedDetail }) {
  const scroll = useRef<ScrollViewInstance>(null);
  // 섹션 머리 위치(스크롤 기준). 탭을 누를 때와 스크롤할 때 읽는다.
  // 구역마다 Stagger가 따로 감싸서 섹션의 onLayout y는 감싼 칸 기준이다. 감싼 칸의 위치(itemTops)를 더해야
  // 스크롤 위치가 된다. 전에는 감싼 칸 기준 값(거의 0)만 써서 탭을 눌러도 엉뚱한 곳으로 가고 강조가 늘 [경비]였다(2026-11-16 QA)
  const [itemTops, setItemTops] = useState<Record<string, number>>({});
  const [inner, setInner] = useState<Partial<Record<SectionKey, number>>>({});
  const tops: Partial<Record<SectionKey, number>> = {};
  for (const s of SECTIONS) {
    const item = itemTops[ITEM_OF[s.key]];
    const y = inner[s.key];
    if (item !== undefined && y !== undefined) tops[s.key] = item + y;
  }
  const [current, setCurrent] = useState<SectionKey>('photos');
  const shown = SECTIONS.filter((s) => {
    if (s.key === 'photos') return detail.photos.length > 0;
    if (s.key === 'route' || s.key === 'places') return detail.days.length > 0;
    return detail.expenseTotal !== null;
  });

  const mark = (key: SectionKey) => (e: { nativeEvent: { layout: { y: number } } }) => {
    const y = e.nativeEvent.layout.y;
    setInner((prev) => (prev[key] === y ? prev : { ...prev, [key]: y }));
  };
  const markItem = (key: Key, y: number) => {
    const k = String(key);
    setItemTops((prev) => (prev[k] === y ? prev : { ...prev, [k]: y }));
  };
  // 탭을 눌러 옮기는 중. 손으로 끌기 전까지는 스크롤 위치로 탭을 바꾸지 않는다.
  // 내용이 짧아 끝까지 못 내려가면 스크롤 위치로는 앞 섹션이 골라져, 누른 탭 대신 [사진]이 강조됐다(2026-11-16 실서버 QA)
  const jumping = useRef(false);
  // 탭을 누르면 그 섹션 머리로 스크롤한다. 손으로 내릴 때는 보이는 섹션에 맞춰 탭이 바뀐다
  const jump = (key: SectionKey) => {
    jumping.current = true;
    setCurrent(key);
    scroll.current?.scrollTo({
      y: Math.max(0, (tops[key] ?? 0) - spacing[16]),
      animated: true,
    });
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (jumping.current) return;
    const y = e.nativeEvent.contentOffset.y + 48;
    const at = [...shown].reverse().find((s) => (tops[s.key] ?? Infinity) <= y);
    const next = at?.key ?? shown[0]?.key;
    if (next && next !== current) setCurrent(next);
  };

  const cover = assetSource(detail.coverUrl);
  const who = membersLabel(detail.members.map((m) => m.name));

  return (
    <ScrollView
      decelerationRate={SCROLL_DECELERATION}
      ref={scroll}
      contentContainerStyle={styles.content}
      onScroll={onScroll}
      onScrollBeginDrag={() => {
        jumping.current = false;
      }}
      scrollEventThrottle={64}
      showsVerticalScrollIndicator={false}
    >
      <Stagger itemStyle={styles.staggerItem} onItemLayout={markItem}>
        <View style={styles.cover}>
          <Icon name="image" size={32} color={colors.brand.primary} />
          {cover ? (
            <Image source={cover} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : null}
        </View>

        <View style={styles.titleBlock}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={2}>
              {detail.title}
            </Text>
            <PressableScale
              onPress={props.onLike}
              style={({ pressed }) => [styles.like, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityState={{ selected: detail.likedByMe }}
              accessibilityLabel={`좋아요 ${detail.likeCount}개${detail.likedByMe ? ', 누름' : ''}`}
            >
              <Icon
                name="heart"
                size={20}
                color={detail.likedByMe ? colors.brand.accent : colors.text.default}
                filled={detail.likedByMe}
              />
              <Text style={styles.likeCount}>{detail.likeCount}</Text>
            </PressableScale>
          </View>
          <View style={styles.meta}>
            {who ? (
              <View style={styles.metaItem}>
                <AvatarGroup people={detail.members} max={3} />
                <Text style={styles.metaText}>{who}</Text>
              </View>
            ) : null}
            {detail.periodLabel ? (
              <View style={styles.metaItem}>
                <Icon name="calendar" size={16} color={colors.text.icon} />
                <Text style={styles.metaText}>{detail.periodLabel}</Text>
              </View>
            ) : null}
            {detail.nightsLabel ? (
              <View style={styles.metaItem}>
                <Icon name="moon" size={16} color={colors.text.icon} />
                <Text style={styles.metaText}>{detail.nightsLabel}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {shown.length > 1 ? (
          <View style={styles.tabs} accessibilityRole="tablist">
            {shown.map((s) => (
              <Chip
                key={s.key}
                label={s.label}
                selected={current === s.key}
                onPress={() => jump(s.key)}
              />
            ))}
          </View>
        ) : null}

        {detail.photos.length > 0 ? (
          <View key="photos" style={styles.section} onLayout={mark('photos')}>
            <Text style={styles.sectionTitle}>사진</Text>
            <View style={styles.photos}>
              {detail.photos.map((p, i) => {
                const src = assetSource(p.url);
                const last = i === detail.photos.length - 1 && detail.morePhotos > 0;
                return (
                  <PressableScale
                    key={p.id}
                    onPress={() => props.onPhotos(i)}
                    style={styles.photo}
                    accessibilityRole="button"
                    accessibilityLabel={last ? `사진 ${detail.morePhotos}장 더 보기` : '사진 보기'}
                  >
                    {last ? null : <Icon name="image" size={22} color={colors.brand.primary} />}
                    {src ? (
                      <Image source={src} style={StyleSheet.absoluteFill} contentFit="cover" />
                    ) : null}
                    {last ? (
                      <View style={styles.more}>
                        <Text style={styles.moreText}>+{detail.morePhotos}</Text>
                      </View>
                    ) : null}
                  </PressableScale>
                );
              })}
            </View>
          </View>
        ) : null}

        {detail.days.length > 0 ? (
          <Fragment key="days">
            <View style={styles.section} onLayout={mark('route')}>
              <Text style={styles.sectionTitle}>경로</Text>
              <RouteMap days={detail.days} />
            </View>

            <View style={styles.section} onLayout={mark('places')}>
              <Text style={styles.sectionTitle}>장소와 이동</Text>
              <View style={styles.days}>
                {detail.days.map((d) => (
                  <View key={d.day} style={styles.day}>
                    <View style={styles.dayHead}>
                      <View style={styles.dayBadge}>
                        <Text style={styles.dayBadgeText}>{d.day}일차</Text>
                      </View>
                      {d.dateLabel ? <Text style={styles.dayDate}>{d.dateLabel}</Text> : null}
                    </View>
                    {d.stops.map((stop) => (
                      <View key={stop.itemId}>
                        <StopRow
                          stop={stop}
                          saved={props.savedPlaceIds?.has(stop.placeId) ?? false}
                          onPress={() => props.onPlace(stop)}
                          onSave={() => props.onSavePlace(stop)}
                        />
                        {stop.next ? (
                          <View style={styles.leg}>
                            <View style={styles.legChip}>
                              <Icon
                                name={MODE_ICON[stop.next.mode]}
                                size={14}
                                color={colors.text.icon}
                              />
                              <Text style={styles.legText}>
                                {minutesLabel(stop.next.minutes) ?? '이동'}
                              </Text>
                            </View>
                          </View>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </View>
          </Fragment>
        ) : null}

        {detail.expenseTotal !== null ? (
          <View key="expense" style={styles.section} onLayout={mark('expense')}>
            <Text style={styles.sectionTitle}>경비</Text>
            <View style={styles.expense}>
              <View style={styles.metaItem}>
                <Icon name="card" size={20} color={colors.text.icon} />
                <Text style={styles.expenseLabel}>합계</Text>
              </View>
              <Text style={styles.expenseTotal}>{wonShort(detail.expenseTotal)}</Text>
            </View>
          </View>
        ) : null}
      </Stagger>
    </ScrollView>
  );
}

function StopRow({
  stop,
  saved,
  onPress,
  onSave,
}: {
  stop: FeedStop;
  saved: boolean;
  onPress: () => void;
  onSave: () => void;
}) {
  const src = assetSource(stop.photoUrl);
  return (
    <View style={styles.stop}>
      <PressableScale
        onPress={onPress}
        style={({ pressed }) => [styles.stopMain, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${stop.number}번 ${stop.name}${stop.score !== null ? `, 평점 ${stop.score}` : ''}${stop.review ? `, ${stop.reviewAuthor ?? ''} ${stop.review}` : ''}`}
      >
        <View>
          <View style={styles.thumb}>
            <Icon name="image" size={20} color={colors.brand.primary} />
            {src ? <Image source={src} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
          </View>
          <View style={styles.number}>
            <Text style={styles.numberText}>{stop.number}</Text>
          </View>
        </View>
        <View style={styles.stopText}>
          <View style={styles.stopNameRow}>
            <Text style={styles.stopName} numberOfLines={1}>
              {stop.name}
            </Text>
            {stop.score !== null ? (
              <View style={styles.score}>
                <Icon name="star" size={14} color={colors.text.default} filled />
                <Text style={styles.scoreText}>{stop.score.toFixed(1)}</Text>
              </View>
            ) : null}
          </View>
          {stop.review ? (
            <Text style={styles.review} numberOfLines={1}>
              {stop.reviewAuthor ? (
                <Text style={styles.reviewAuthor}>{stop.reviewAuthor} · </Text>
              ) : null}
              {stop.review}
            </Text>
          ) : null}
        </View>
      </PressableScale>
      <PressableScale
        onPress={onSave}
        style={({ pressed }) => [styles.save, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={saved ? `${stop.name} 저장 해제` : `${stop.name} 저장`}
      >
        {/* 저장한 곳은 채운 파란 책갈피. 다시 누르면 저장을 해제한다 */}
        <Icon
          name="bookmark"
          size={20}
          color={saved ? colors.brand.primary : colors.text.default}
          filled={saved}
        />
      </PressableScale>
    </View>
  );
}

const PHOTO = 110;

const styles = StyleSheet.create({
  // 차례로 나타나는 구역을 감싼 칸. 한 구역이 여러 줄이면 그 사이 간격을 스크롤 내용과 같게 둔다
  staggerItem: { gap: spacing[32] },
  screen: { flex: 1, backgroundColor: colors.surface.white },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  content: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[16],
    paddingBottom: 48,
    gap: spacing[32],
  },
  cover: {
    height: 196,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.brand.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: { gap: spacing[10] },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[12],
  },
  title: { ...typography.title1, color: colors.text.default, flex: 1 },
  like: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
    height: 36,
    paddingHorizontal: spacing[14],
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
  },
  likeCount: { ...typography.bodyMedium, color: colors.text.default },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    // 보조 글자가 13으로 커진 뒤 폭 360 기기에서 기간이 다음 줄로 넘어가 사이를 좁혔다(16 → 10, 6 → 4)
    columnGap: spacing[10],
    rowGap: spacing[6],
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  metaText: { ...typography.caption, color: colors.text.sub },
  tabs: { flexDirection: 'row', gap: spacing[10], marginTop: -spacing[8] },
  // 11/09 직접 확인에서 빽빽하다고 해 섹션·일차·장소 사이를 조금씩 넓혔다
  section: { gap: spacing[16] },
  sectionTitle: { ...typography.title3, color: colors.text.default },
  photos: { flexDirection: 'row', gap: spacing[10] },
  photo: {
    flex: 1,
    maxWidth: PHOTO,
    aspectRatio: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.brand.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  more: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(31, 36, 48, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: {
    ...typography.title2,
    fontFamily: typography.bodyMedium.fontFamily,
    color: colors.text.inverse,
  },
  days: { gap: spacing[32] },
  day: { gap: spacing[18] },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[10] },
  dayBadge: {
    paddingHorizontal: spacing[10],
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.brand.primaryBg,
  },
  dayBadgeText: { ...typography.captionBold, color: colors.brand.primaryDark },
  dayDate: { ...typography.caption, color: colors.text.sub },
  stop: { flexDirection: 'row', alignItems: 'center', gap: spacing[12] },
  stopMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[14] },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.brand.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  number: {
    position: 'absolute',
    top: -6,
    left: -6,
    width: 22,
    height: 22,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.surface.white,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: { ...typography.micro, color: colors.text.inverse },
  stopText: { flex: 1, minWidth: 0, gap: spacing[4] },
  stopNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
  stopName: { ...typography.bodyBold, color: colors.text.default, flexShrink: 1 },
  score: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  scoreText: { ...typography.captionBold, color: colors.text.default },
  review: { ...typography.caption, color: colors.text.sub },
  // 누가 쓴 평가인지. 이름만 조금 진하게
  reviewAuthor: { ...typography.captionMedium, color: colors.text.strong },
  save: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leg: { paddingLeft: 70, paddingTop: spacing[14] },
  legChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
    paddingHorizontal: spacing[10],
    height: 24,
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
  },
  legText: { ...typography.caption, color: colors.text.sub },
  expense: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing[20],
    borderRadius: radius.lg,
    backgroundColor: colors.surface.default,
  },
  expenseLabel: { ...typography.body, color: colors.text.sub },
  expenseTotal: { ...typography.title1, color: colors.text.default },
});
