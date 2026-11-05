import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Header, Icon, Tag } from '@/components/ui';
import { colors, layout, spacing, typography } from '@/theme';

import type { RecordSummary } from '../record-rules';

import { OutlinePillButton } from './outline-pill-button';
import { RecordSummaryCard } from './record-summary-card';

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
      <Header onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[typography.title1, styles.text]}>내 여행 기록</Text>

        <View style={styles.head}>
          {feed.status === 'published' ? (
            <View style={styles.tagRow}>
              <Tag label="게시됨" tone="brand" icon="check" />
              <Text style={[typography.caption, styles.visibility]}>{feed.visibility}</Text>
            </View>
          ) : (
            <View style={styles.tagRow}>
              <Tag label="게시 전" />
            </View>
          )}
          <Text style={[typography.title1, styles.text]}>{tripTitle}</Text>
          {period || companions ? (
            <View style={styles.info}>
              {period ? (
                <View style={styles.infoItem}>
                  <Icon name="calendar" size={16} color={colors.text.icon} />
                  <Text style={[typography.caption, styles.sub]}>{period}</Text>
                </View>
              ) : null}
              {companions ? (
                <View style={[styles.infoItem, styles.shrink]}>
                  <Icon name="people" size={16} color={colors.text.icon} />
                  <Text style={[typography.caption, styles.sub, styles.shrink]} numberOfLines={1}>
                    {companions}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
          {feed.status === 'draft' ? (
            <Text style={[typography.caption, styles.sub]}>게시하면 모두에게 공개돼요</Text>
          ) : feed.hiddenNote ? (
            <Text style={[typography.caption, styles.sub]}>{feed.hiddenNote}</Text>
          ) : null}
        </View>

        {/* 사진 API가 아직 없어 장수·올린 사람·썸네일 없이 머리 줄만 그린다 */}
        <Card onPress={onPhotos} accessibilityLabel="사진" style={styles.photoCard}>
          <View style={styles.photoHead}>
            <Icon name="image" size={20} color={colors.text.default} />
            <Text style={[typography.bodyBold, styles.text]}>사진</Text>
            <Text style={[typography.caption, styles.sub, styles.grow]}>
              사진 기능을 준비 중이에요
            </Text>
            <Icon name="chevron-right" size={16} color={colors.text.icon} />
          </View>
        </Card>

        <View style={styles.summaries}>
          <RecordSummaryCard icon="map-pin" label="코스" {...course} onPress={onCourse} />
          <RecordSummaryCard icon="star" label="평가" {...review} onPress={onReview} />
          <RecordSummaryCard icon="card" label="경비" {...expense} onPress={onExpense} />
        </View>

        <View style={styles.manage}>
          <OutlinePillButton label="장소 위치 바꾸기" icon="map-pin" onPress={onMovePin} />
          <OutlinePillButton
            label="기록 삭제"
            icon="trash"
            color={colors.status.danger}
            onPress={onDelete}
          />
        </View>
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, BOTTOM_GAP) }]}>
        {published ? (
          <>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={onDeleteFeed}>
              <Text style={[typography.bodyMedium, styles.sub]}>공동 피드 삭제</Text>
            </Pressable>
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
            weight="medium"
            onPress={onPublish}
            leading={<Icon name="upload" size={20} color={colors.text.inverse} />}
            style={styles.publish}
          />
        )}
      </View>
    </View>
  );
}

/** 아래 버튼 밑 여백(Figma 34). 기기 아래 안전 영역이 더 크면 그만큼 */
const BOTTOM_GAP = 34;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  content: {
    paddingTop: spacing[16],
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: spacing[24],
    gap: spacing[20],
  },
  head: { gap: spacing[10] },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[10] },
  visibility: { color: colors.brand.primaryDark, flexShrink: 1 },
  info: { flexDirection: 'row', alignItems: 'center', gap: spacing[12] },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  shrink: { flexShrink: 1 },
  grow: { flex: 1 },
  photoCard: { gap: spacing[16] },
  photoHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  summaries: { flexDirection: 'row', gap: spacing[8] },
  manage: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[10] },
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
