import { Image } from 'expo-image';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, CenterNotice, ErrorState, Header, Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { SkeletonList } from '@/components/ui/skeleton';
import { assetSource } from '@/lib/asset-image';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { photoPath, sectionMeta, type PlaceSection, type TopicFilter } from '../photo-list-rules';
import type { TripPhoto } from '../types';
import { TripPhotoTile } from './trip-photo-tile';

const COLUMNS = 3;
const GAP = spacing[10];

export type TripPhotosViewProps = {
  state: 'loading' | 'error' | 'ready';
  tripTitle: string | null;
  chips: { key: TopicFilter; label: string; count: number }[];
  topic: TopicFilter;
  sections: PlaceSection[];
  /** 장소 미지정 사진(거르기 전 전체) */
  unplaced: TripPhoto[];
  totalCount: number;
  footer: string;
  memberName: (memberId: string) => string;
  myMemberId: string | null;
  onBack: () => void;
  onUpload: () => void;
  onTopic: (topic: TopicFilter) => void;
  onUnplaced: () => void;
  onPhoto: (photo: TripPhoto) => void;
  /** 장소 묶음 [수정] → S32. 내 사진이 있는 묶음에만 보인다 */
  onEditSection: (placeId: string) => void;
  onPublish: () => void;
  onRetry: () => void;
};

/**
 * S31 여행 사진 목록(WD-FR-19·20). 주제 칩 → 장소 미지정 안내 줄 → 장소별 묶음(3열) → 아래 [공동 피드 게시].
 * 비슷한 사진 묶음(groupId)과 분류 진행(분류 중·분류 실패)은 서버가 아직 지원하지 않아 사진을 한 장씩 보인다
 */
export function TripPhotosView(props: TripPhotosViewProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tile = Math.floor(
    (Math.min(width, 480) - layout.screenPaddingX * 2 - GAP * (COLUMNS - 1)) / COLUMNS,
  );
  const header = (
    <Header
      title="사진"
      subtitle={props.tripTitle ?? undefined}
      onBack={props.onBack}
      right={
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="사진 올리기"
          hitSlop={8}
          onPress={props.onUpload}
          style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
        >
          <Icon name="upload" size={24} color={colors.text.default} />
        </PressableScale>
      }
    />
  );

  if (props.state !== 'ready') {
    return (
      <View style={styles.screen}>
        {header}
        {props.state === 'error' ? (
          <ErrorState title="사진을 불러오지 못했어요" onRetry={props.onRetry} />
        ) : (
          <SkeletonList style={styles.flex} />
        )}
      </View>
    );
  }

  if (props.totalCount === 0) {
    return (
      <View style={styles.screen}>
        {header}
        <CenterNotice
          icon="image"
          tone="brand"
          title="아직 올린 사진이 없어요"
          description="사진을 올리면 장소별로 나눠요"
          actionLabel="사진 올리기"
          actionIcon="upload"
          onAction={props.onUpload}
        />
      </View>
    );
  }

  const empty = props.sections.length === 0;
  return (
    <View style={styles.screen}>
      {header}
      <ScrollView contentContainerStyle={styles.body}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {props.chips.map((chip) => {
            const on = chip.key === props.topic;
            return (
              <PressableScale
                key={chip.key}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${chip.label} ${chip.count}장`}
                onPress={() => props.onTopic(chip.key)}
                style={({ pressed }) => [
                  styles.chip,
                  on && styles.chipOn,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[typography.bodyMedium, on ? styles.chipTextOn : styles.chipText]}>
                  {chip.label}
                </Text>
                <Text style={[typography.captionMedium, on ? styles.chipTextOn : styles.chipText]}>
                  {chip.count}
                </Text>
              </PressableScale>
            );
          })}
        </ScrollView>

        {props.unplaced.length > 0 ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`장소 미지정 ${props.unplaced.length}장, 연결하기`}
            onPress={props.onUnplaced}
            style={({ pressed }) => [styles.unplaced, pressed && styles.pressed]}
          >
            <View style={styles.stack}>
              {props.unplaced.slice(0, 3).map((p, i) => {
                const source = assetSource(photoPath(p.assetId));
                return (
                  <View key={p.id} style={[styles.stackItem, { marginLeft: i === 0 ? 0 : -12 }]}>
                    {source ? (
                      <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" />
                    ) : null}
                  </View>
                );
              })}
            </View>
            <View style={styles.flex}>
              <Text style={[typography.bodyBold, styles.text]}>
                장소 미지정 {props.unplaced.length}장
              </Text>
              <Text style={[typography.caption, styles.sub]}>어디서 찍었는지 연결해 주세요</Text>
            </View>
            <View style={styles.inline}>
              <Text style={[typography.captionMedium, styles.link]}>연결하기</Text>
              <Icon name="chevron-right" size={14} color={colors.brand.primaryDark} />
            </View>
          </PressableScale>
        ) : null}

        {empty ? (
          <Text style={[typography.body, styles.sub, styles.emptyText]}>
            {props.topic === 'ALL' ? '장소에 연결된 사진이 아직 없어요' : '이 주제의 사진이 없어요'}
          </Text>
        ) : (
          props.sections.map((section) => (
            <View key={section.placeId} style={styles.section}>
              <View style={styles.sectionHead}>
                <View style={[styles.inline, styles.flex]}>
                  <Icon name="map-pin" size={18} color={colors.text.default} />
                  <Text style={[typography.title3, styles.text, styles.flex]} numberOfLines={1}>
                    {section.name ?? '장소'}
                  </Text>
                </View>
                <Text style={[typography.caption, styles.sub]}>{sectionMeta(section)}</Text>
                {section.photos.some((p) => p.uploaderMemberId === props.myMemberId) ? (
                  <PressableScale
                    accessibilityRole="button"
                    accessibilityLabel={`${section.name ?? '장소'} 사진 수정`}
                    // 아이콘 18에 사방 13씩 넓혀 누르는 자리 44
                    hitSlop={13}
                    onPress={() => props.onEditSection(section.placeId)}
                    style={({ pressed }) => pressed && styles.pressed}
                  >
                    <Icon name="pencil" size={18} color={colors.brand.primaryDark} />
                  </PressableScale>
                ) : null}
              </View>
              <View style={styles.grid}>
                {section.photos.map((photo, i) => (
                  <TripPhotoTile
                    key={photo.id}
                    assetId={photo.assetId}
                    width={tile}
                    height={tile + 1}
                    uploader={props.memberName(photo.uploaderMemberId)}
                    mine={photo.uploaderMemberId === props.myMemberId}
                    label={`${section.name ?? '장소'} 사진 ${i + 1}`}
                    onPress={() => props.onPhoto(photo)}
                  />
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom + spacing[12], 34) }]}>
        <Text style={[typography.caption, styles.sub, styles.flex]}>{props.footer}</Text>
        <Button
          label="공동 피드 게시"
          size="lg"
          leading={<Icon name="globe" size={20} color={colors.text.inverse} />}
          onPress={props.onPublish}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  flex: { flex: 1 },
  text: { color: colors.text.default },
  sub: { color: colors.text.icon },
  link: { color: colors.brand.primaryDark },
  pressed: { opacity: 0.6 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[16],
    paddingBottom: spacing[24],
    gap: spacing[24],
  },
  chips: { gap: spacing[10] },
  chip: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    paddingHorizontal: 14,
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
  },
  chipOn: { backgroundColor: colors.brand.primaryLight },
  chipText: { color: colors.text.icon },
  chipTextOn: { color: colors.brand.primaryDark },
  unplaced: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[14],
    padding: spacing[16],
    borderRadius: radius.lg,
    backgroundColor: colors.surface.subtle,
  },
  stack: { flexDirection: 'row' },
  stackItem: {
    width: 40,
    height: 40,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.surface.subtle,
    backgroundColor: colors.line.default,
  },
  emptyText: { textAlign: 'center', paddingVertical: spacing[24] },
  section: { gap: spacing[12] },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
    paddingTop: spacing[12],
    paddingHorizontal: layout.screenPaddingX,
    borderTopWidth: 1,
    borderTopColor: colors.line.default,
  },
});
