import { SCROLL_DECELERATION } from '@/theme/scroll';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Stagger } from '@/components/ui/stagger';
import { AvatarGroup, Button, Header, Icon, Tag, TextField } from '@/components/ui';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { REVIEW_BODY_MAX } from '../review-rules';
import type { VisitEvidenceType } from '../types';

import { ReviewCard, type ReviewCardData } from './review-card';
import { StarInput } from './stars';

export type ReviewViewProps = {
  tripTitle: string;
  /** 상단 얼굴 묶음. 참여 순, 나는 연파랑 */
  people: { name: string; imageUrl: string | null; me: boolean }[];
  placeName: string;
  /** "1일차 · 11.14(토) 10:00" */
  when: string;
  evidence: VisitEvidenceType;
  /** write: 별점·한 줄 평가 입력 / done: 남긴 뒤(내 평가 카드) */
  mode: 'write' | 'done';
  score: number | null;
  body: string;
  onScore: (score: number) => void;
  onBody: (body: string) => void;
  canSave: boolean;
  saving?: boolean;
  /** 저장 실패. 맨 위 안내 상자 + 아래 버튼이 [다시 저장] */
  saveFailed?: boolean;
  onSave: () => void;
  /** 남긴 뒤의 내 평가 */
  myReview: ReviewCardData | null;
  companions: ReviewCardData[];
  onEdit: () => void;
  onDelete: () => void;
  onBack?: () => void;
};

/**
 * S34 평점·평가 작성. 상태: 작성 / 남긴 뒤 / 저장 실패.
 * 불러오기 실패·방문 없음은 화면(ReviewScreen)이 가운데 안내 화면으로 그린다
 */
export function ReviewView({
  tripTitle,
  people,
  placeName,
  when,
  evidence,
  mode,
  score,
  body,
  onScore,
  onBody,
  canSave,
  saving = false,
  saveFailed = false,
  onSave,
  myReview,
  companions,
  onEdit,
  onDelete,
  onBack,
}: ReviewViewProps) {
  const insets = useSafeAreaInsets();
  const writing = mode === 'write';

  return (
    <View style={styles.screen}>
      <Header
        title={writing ? '평가 남기기' : '평가'}
        subtitle={tripTitle}
        onBack={onBack}
        right={people.length > 0 ? <AvatarGroup people={people} size="sm" /> : undefined}
      />
      <ScrollView
        decelerationRate={SCROLL_DECELERATION}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Stagger itemStyle={styles.staggerItem}>
          {writing && saveFailed ? (
            <View style={styles.failBox} accessibilityLiveRegion="polite">
              <View style={styles.boxIcon}>
                <Icon name="alert" size={22} color={colors.status.danger} />
              </View>
              <View style={styles.flex}>
                <Text style={[typography.bodyBold, styles.text]}>평가를 저장하지 못했어요</Text>
                <Text style={[typography.caption, styles.sub]}>
                  저장하지 못했어요. 다시 눌러 주세요
                </Text>
              </View>
            </View>
          ) : null}

          {/* 장소 사진 API가 없어 N4처럼 연파랑 상자에 아이콘을 둔다 */}
          <View style={styles.place}>
            <View style={styles.photo}>
              <Icon name="map-pin" size={24} color={colors.brand.primary} />
            </View>
            <View style={styles.placeTexts}>
              <Text style={[typography.bodyBold, styles.text]} numberOfLines={1}>
                {placeName}
              </Text>
              <View style={styles.whenRow}>
                <View style={styles.when}>
                  <Icon name="calendar" size={16} color={colors.text.icon} />
                  <Text style={[typography.caption, styles.sub]} numberOfLines={1}>
                    {when}
                  </Text>
                </View>
                <Tag
                  label={evidence === 'PHOTO' ? '사진으로 확인됨' : '직접 체크함'}
                  tone="success"
                  icon="check"
                />
              </View>
            </View>
          </View>

          {writing ? (
            <>
              <View style={styles.stars}>
                <StarInput value={score} onChange={onScore} disabled={saving} />
                {score !== null ? (
                  <Text style={[typography.title1, styles.text]}>{score}점</Text>
                ) : null}
              </View>
              <View style={styles.section}>
                <Text style={[typography.bodyBold, styles.text]}>한 줄 평가</Text>
                <TextField
                  variant="filled"
                  value={body}
                  onChangeText={onBody}
                  placeholder="어땠는지 한 줄로 남겨 주세요"
                  maxLength={REVIEW_BODY_MAX}
                  hideCount
                  editable={!saving}
                  accessibilityLabel="한 줄 평가"
                />
              </View>
            </>
          ) : myReview ? (
            <View style={styles.section}>
              <Text style={[typography.title3, styles.text]}>내 평가</Text>
              <ReviewCard review={myReview} mine onEdit={onEdit} onDelete={onDelete} />
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={[typography.title3, styles.text]}>동행 평가</Text>
            {companions.length > 0 ? (
              companions.map((r) => <ReviewCard key={r.id} review={r} />)
            ) : (
              <Text style={[typography.caption, styles.sub]}>아직 평가를 남긴 동행이 없어요</Text>
            )}
          </View>
        </Stagger>
      </ScrollView>

      {writing ? (
        <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, BOTTOM_GAP) }]}>
          <Button
            label={saveFailed ? '다시 저장' : '저장'}
            icon={saveFailed ? 'refresh' : 'check'}
            weight="medium"
            disabled={!canSave}
            loading={saving}
            onPress={onSave}
            style={styles.save}
          />
        </View>
      ) : null}
    </View>
  );
}

/** 아래 버튼 밑 여백(Figma 34). 기기 아래 안전 영역이 더 크면 그만큼 */
const BOTTOM_GAP = 34;

const styles = StyleSheet.create({
  // 차례로 나타나는 구역을 감싼 칸. 한 구역이 여러 줄이면 그 사이 간격을 스크롤 내용과 같게 둔다
  staggerItem: { gap: spacing[24] },
  screen: { flex: 1, backgroundColor: colors.surface.white },
  content: {
    paddingTop: spacing[16],
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: spacing[24],
    gap: spacing[24],
  },
  flex: { flex: 1 },
  // README 안내 상자(회색)·S35 지출 저장 실패와 같은 모양: 둥글기 20, 안쪽 20, 간격 14
  failBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[14],
    padding: spacing[20],
    borderRadius: radius.xl,
    backgroundColor: colors.surface.subtle,
  },
  // README 안내 상자(회색): 흰 동그라미 44 안에 아이콘 22
  boxIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  place: { flexDirection: 'row', alignItems: 'center', gap: spacing[14] },
  // 피그마 둥글기 14는 토큰에 없어 radius.md(12)
  photo: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.brand.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeTexts: { flex: 1, gap: spacing[8] },
  whenRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[8], flexWrap: 'wrap' },
  when: { flexDirection: 'row', alignItems: 'center', gap: spacing[4], flexShrink: 1 },
  stars: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[4],
  },
  section: { gap: spacing[12] },
  bottom: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[12],
  },
  save: { paddingLeft: spacing[20], paddingRight: spacing[24] },
  text: { color: colors.text.default },
  sub: { color: colors.text.icon },
});
