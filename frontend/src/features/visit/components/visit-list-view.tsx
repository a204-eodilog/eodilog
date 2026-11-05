import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AvatarGroup, EmptyState, Header, Icon } from '@/components/ui';
import { colors, layout, spacing, typography } from '@/theme';

import type { VisitDay, VisitRow as VisitRowData } from '../visit-rules';

import { NoCandidateBox } from './no-candidate-box';
import { VisitRow } from './visit-row';

export type VisitListViewProps = {
  tripTitle: string;
  /** 상단 얼굴 묶음. 참여 순, 나는 연파랑 */
  people: { name: string; imageUrl: string | null; me: boolean }[];
  days: VisitDay[];
  /** null이면 요약 대신 방문 후보 없음 상자 */
  summary: string | null;
  /** [다녀옴]을 보내는 중이거나 되돌리는 중인 장소. 그 줄의 [다녀옴]을 막는다 */
  busyPlaceIds?: string[];
  onCheck: (row: VisitRowData) => void;
  onReview: (row: VisitRowData) => void;
  onUpload: () => void;
  /** 없으면 상단 바 기본 뒤로(이전 화면) */
  onBack?: () => void;
};

/**
 * S33 방문 장소 평가 목록. 상태: 방문 후보 있음 / 사진 없는 장소 직접 체크 / 방문 후보 없음.
 * 불러오기 실패는 화면(VisitListScreen)이 가운데 안내 화면으로 그린다
 */
export function VisitListView({
  tripTitle,
  people,
  days,
  summary,
  busyPlaceIds = [],
  onCheck,
  onReview,
  onUpload,
  onBack,
}: VisitListViewProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <Header
        title="평가"
        subtitle={tripTitle}
        onBack={onBack}
        right={people.length > 0 ? <AvatarGroup people={people} size="sm" /> : undefined}
      />

      {days.length === 0 ? (
        <EmptyState
          icon="map-pin"
          title="코스에 넣은 장소가 없어요"
          description="코스를 짜면 다녀온 곳을 평가할 수 있어요"
        />
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, spacing[24]) },
          ]}
        >
          <Text style={[typography.caption, styles.guide]}>
            사진 위치와 날짜로 다녀온 곳을 찾아요
          </Text>
          {summary ? (
            <Text style={[typography.bodyBold, styles.text]}>{summary}</Text>
          ) : (
            <NoCandidateBox onUpload={onUpload} />
          )}

          {days.map((day) => (
            <View key={day.day} style={styles.day}>
              <Text style={[typography.captionMedium, styles.dayTitle]}>{day.title}</Text>
              <View style={styles.rows}>
                {day.rows.map((row) => (
                  <VisitRow
                    key={row.itemId}
                    row={row}
                    checking={busyPlaceIds.includes(row.placeId)}
                    onCheck={() => onCheck(row)}
                    onReview={() => onReview(row)}
                  />
                ))}
              </View>
            </View>
          ))}

          <View style={styles.footer}>
            <Icon name="info" size={16} color={colors.text.icon} />
            <Text style={[typography.caption, styles.footerText]}>
              다녀온 곳만 평가할 수 있어요
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  content: {
    paddingTop: spacing[16],
    paddingHorizontal: layout.screenPaddingX,
    gap: spacing[14],
  },
  guide: { color: colors.text.sub2 },
  text: { color: colors.text.default },
  day: { gap: spacing[8] },
  dayTitle: { color: colors.text.icon },
  rows: { gap: spacing[8] },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  footerText: { color: colors.text.icon },
});
