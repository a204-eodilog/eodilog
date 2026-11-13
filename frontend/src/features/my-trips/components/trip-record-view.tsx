import { SCROLL_DECELERATION } from '@/theme/scroll';
import { Image } from 'expo-image';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Stagger } from '@/components/ui/stagger';
import { Button, Card, Header, Icon, type IconName } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { photoPath } from '@/features/photo';
import { assetSource } from '@/lib/asset-image';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { type PhotoCardInfo, PHOTO_CARD_THUMBS } from '../photo-card-rules';
import type { RecordSummary } from '../record-rules';

import { OutlinePillButton } from './outline-pill-button';

/** 공동 피드 상태. 게시됨이면 노출 줄("전체 공개 · 하늘에게 숨김")과 숨긴 친구 안내 */
export type RecordFeed =
  { status: 'draft' } | { status: 'published'; visibility: string; hiddenNote: string | null };

export type TripRecordViewProps = {
  tripTitle: string;
  /** "11.14 – 11.15 · 1박 2일". 기간을 안 정했으면 null */
  period: string | null;
  /** "서연, 민준과 함께". 혼자면 null */
  companions: string | null;
  feed: RecordFeed;
  photos: PhotoCardInfo;
  course: RecordSummary;
  review: RecordSummary;
  expense: RecordSummary;
  onBack?: () => void;
  onPhotos: () => void;
  onCourse: () => void;
  onReview: () => void;
  onExpense: () => void;
  onMovePin: () => void;
  onDelete: () => void;
  onPublish: () => void;
  onVisibility: () => void;
  onDeleteFeed: () => void;
};

/**
 * S38 내 여행 기록. 상태: 게시 전 / 게시됨. 게시 확인은 PublishSheet,
 * 불러오기 실패는 화면(MyTripRecordScreen)이 가운데 안내 화면으로 그린다
 */
export function TripRecordView({
  tripTitle,
  period,
  companions,
  feed,
  photos,
  course,
  review,
  expense,
  onBack,
  onPhotos,
  onCourse,
  onReview,
  onExpense,
  onMovePin,
  onDelete,
  onPublish,
  onVisibility,
  onDeleteFeed,
}: TripRecordViewProps) {
  const insets = useSafeAreaInsets();
  const published = feed.status === 'published';

  return (
    <View style={styles.screen}>
      <Header onBack={onBack} title="내 여행 기록" />
      <ScrollView decelerationRate={SCROLL_DECELERATION} contentContainerStyle={styles.content}>
        <Stagger itemStyle={styles.staggerItem}>
          {/* 머리 카드. 여행 상세와 같은 파랑 블록에 여행 이름을 크게, 기간과 동행은 반투명 칩으로 */}
          <View style={styles.hero}>
            <View style={styles.heroTop}>
              <View style={styles.status}>
                <Icon name={published ? 'check' : 'pencil'} size={14} color={colors.text.inverse} />
                <Text style={[typography.captionBold, styles.onBrand]}>
                  {published ? '게시됨' : '게시 전'}
                </Text>
              </View>
              {feed.status === 'published' ? (
                <Text
                  style={[typography.caption, styles.onBrandSoft, styles.shrink]}
                  numberOfLines={1}
                >
                  {feed.visibility}
                </Text>
              ) : null}
            </View>
            <Text style={[typography.hero, styles.onBrand]} numberOfLines={2}>
              {tripTitle}
            </Text>
            {period || companions ? (
              <View style={styles.chips}>
                {period ? (
                  <View style={styles.chip}>
                    <Icon name="calendar" size={14} color={colors.text.inverse} />
                    <Text style={[typography.captionMedium, styles.onBrand]}>{period}</Text>
                  </View>
                ) : null}
                {companions ? (
                  <View style={[styles.chip, styles.shrink]}>
                    <Icon name="people" size={14} color={colors.text.inverse} />
                    <Text
                      style={[typography.captionMedium, styles.onBrand, styles.shrink]}
                      numberOfLines={1}
                    >
                      {companions}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            {feed.status === 'draft' ? (
              <Text style={[typography.caption, styles.onBrandSoft]}>
                게시하면 모두에게 공개돼요
              </Text>
            ) : feed.hiddenNote ? (
              <Text style={[typography.caption, styles.onBrandSoft]}>{feed.hiddenNote}</Text>
            ) : null}
          </View>

          {/* 사진. 썸네일을 크게 보여 준다 */}
          <PressableScale
            onPress={onPhotos}
            accessibilityRole="button"
            accessibilityLabel={[photos.title, photos.sub].filter(Boolean).join(', ')}
            style={styles.photoBlock}
          >
            <View style={styles.sectionHead}>
              <Text style={[typography.title3, styles.text]}>{photos.title}</Text>
              <Text style={[typography.caption, styles.sub, styles.grow]} numberOfLines={1}>
                {photos.sub ?? ''}
              </Text>
              <Icon name="chevron-right" size={18} color={colors.text.icon} />
            </View>
            {photos.thumbAssetIds.length > 0 ? (
              <View style={styles.thumbs}>
                {photos.thumbAssetIds.map((assetId) => (
                  <PhotoThumb key={assetId} assetId={assetId} />
                ))}
                {/* 4장보다 적어도 칸 크기를 같게 둔다 */}
                {Array.from({ length: PHOTO_CARD_THUMBS - photos.thumbAssetIds.length }, (_, i) => (
                  <View key={`empty-${i}`} style={[styles.thumbSlot, styles.thumb]} />
                ))}
              </View>
            ) : null}
          </PressableScale>

          {/* 요약. 좁은 세 칸 대신 한 카드에 세 줄로 둬 값이 꺾이지 않는다 */}
          <Card style={styles.summaryCard}>
            <SummaryRow icon="map-pin" label="코스" {...course} onPress={onCourse} />
            <View style={styles.rule} />
            <SummaryRow icon="star" label="평가" {...review} onPress={onReview} />
            <View style={styles.rule} />
            <SummaryRow icon="card" label="경비" {...expense} onPress={onExpense} />
          </Card>

          <View style={styles.manage}>
            <OutlinePillButton label="장소 위치 바꾸기" icon="map-pin" onPress={onMovePin} />
            <OutlinePillButton
              label="기록 삭제"
              icon="trash"
              color={colors.status.danger}
              onPress={onDelete}
            />
          </View>
        </Stagger>
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, BOTTOM_GAP) }]}>
        {published ? (
          <>
            <PressableScale
              accessibilityLabel="공동 피드 삭제"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onDeleteFeed}
            >
              <Icon name="trash" size={20} color={colors.text.icon} />
            </PressableScale>
            <OutlinePillButton
              label="내 노출 설정"
              icon="settings"
              size="lg"
              onPress={onVisibility}
            />
          </>
        ) : (
          <Button
            label="공동 피드 게시"
            icon="upload"
            weight="medium"
            onPress={onPublish}
            style={styles.publish}
          />
        )}
      </View>
    </View>
  );
}

/** 요약 한 줄. 연파랑 동그라미 아이콘, 이름과 보조 글, 오른쪽에 큰 값 */
function SummaryRow({
  icon,
  label,
  value,
  sub: note,
  onPress,
}: RecordSummary & { icon: IconName; label: string; onPress: () => void }) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}, ${note}`}
      style={({ pressed }) => [styles.summaryRow, pressed && styles.pressed]}
    >
      <View style={styles.summaryIcon}>
        <Icon name={icon} size={20} color={colors.brand.primary} />
      </View>
      <View style={styles.grow}>
        <Text style={[typography.bodyBold, styles.text]}>{label}</Text>
        <Text style={[typography.caption, styles.sub]} numberOfLines={1}>
          {note}
        </Text>
      </View>
      <Text style={[typography.title3, styles.value]} numberOfLines={1}>
        {value}
      </Text>
      <Icon name="chevron-right" size={18} color={colors.text.muted} />
    </PressableScale>
  );
}

/** 사진 카드 썸네일 한 칸. 이미지를 못 받으면(테스트 모드 등) 회색 칸 */
function PhotoThumb({ assetId }: { assetId: string }) {
  const source = assetSource(photoPath(assetId));
  return (
    <View style={[styles.thumbSlot, styles.thumb]}>
      {source ? <Image source={source} style={styles.thumbImage} contentFit="cover" /> : null}
    </View>
  );
}

/** 아래 버튼 밑 여백(Figma 34). 기기 아래 안전 영역이 더 크면 그만큼 */
const BOTTOM_GAP = 34;

const styles = StyleSheet.create({
  // 차례로 나타나는 구역을 감싼 칸. 한 구역이 여러 줄이면 그 사이 간격을 스크롤 내용과 같게 둔다
  staggerItem: { gap: spacing[20] },
  screen: { flex: 1, backgroundColor: colors.surface.white },
  content: {
    paddingTop: spacing[16],
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: spacing[24],
    gap: spacing[20],
  },
  // 머리 카드(파랑 블록). 여행 상세 머리와 같은 색과 칩을 쓴다
  hero: {
    padding: spacing[20],
    borderRadius: radius.xxl,
    backgroundColor: colors.brand.primary,
    gap: spacing[12],
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing[10] },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    height: 26,
    paddingHorizontal: spacing[10],
    borderRadius: radius.full,
    backgroundColor: colors.onBrand.chip,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[8] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
    height: 30,
    paddingHorizontal: spacing[12],
    borderRadius: radius.full,
    backgroundColor: colors.onBrand.chip,
  },
  onBrand: { color: colors.text.inverse },
  onBrandSoft: { color: colors.onBrand.textSoft },
  shrink: { flexShrink: 1 },
  grow: { flex: 1 },
  photoBlock: { gap: spacing[12] },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', gap: spacing[8] },
  // 썸네일 넷이 폭을 나눠 서고 높이는 88. 예전 52는 사진이 띠처럼 보였다
  thumbs: { flexDirection: 'row', gap: spacing[6] },
  thumbSlot: { flex: 1, height: 88 },
  thumb: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface.default },
  thumbImage: { width: '100%', height: '100%' },
  summaryCard: { paddingVertical: spacing[6], paddingHorizontal: spacing[16], gap: 0 },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
    minHeight: 68,
    paddingVertical: spacing[10],
  },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.primaryBg,
  },
  value: { color: colors.text.default },
  rule: { height: 1, backgroundColor: colors.line.default, marginLeft: 52 },
  pressed: { opacity: 0.6 },
  manage: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing[10] },
  bottom: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing[10],
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[12],
  },
  publish: { paddingLeft: spacing[20], paddingRight: spacing[24] },
  text: { color: colors.text.default },
  sub: { color: colors.text.icon },
});
