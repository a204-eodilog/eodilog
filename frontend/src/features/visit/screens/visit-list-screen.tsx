import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { CenterNotice, Header, toast } from '@/components/ui';
import { colors } from '@/theme';

import { VisitListView } from '../components/visit-list-view';
import { useVisitBoard } from '../hooks/use-visit-board';
import { useCheckVisit, useUndoVisit } from '../hooks/use-visit-mutations';
import { buildVisitDays, manualVisitedAt, visitSummary, type VisitRow } from '../visit-rules';

/**
 * S33 방문 장소 평가 목록. 여행 상세(S17)의 '평가'에서 연다.
 * 사진 방문 후보(visit-candidates)와 평가(S34) API가 아직 없어서
 * 지금은 코스 장소를 '다녀옴'으로 직접 체크하는 것까지 된다. [평가하기]·[사진 올리기]는 준비 중 안내를 띄운다
 */
export function VisitListScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const board = useVisitBoard(tripId);
  const check = useCheckVisit(tripId);
  const undo = useUndoVisit(tripId);

  const startDate = board.trip?.startDate ?? null;
  const days = useMemo(
    () => buildVisitDays(board.items, board.visits, startDate),
    [board.items, board.visits, startDate],
  );

  if (board.isLoading || board.error || !board.trip) {
    return (
      <View style={styles.screen}>
        <Header title="평가" />
        {board.isLoading ? (
          <ActivityIndicator style={styles.loading} color={colors.brand.primary} />
        ) : (
          <CenterNotice
            icon="alert"
            title="방문 장소를 불러오지 못했어요"
            description="다시 시도해 주세요"
            actionLabel="다시 시도"
            actionIcon="refresh"
            onAction={board.refetch}
          />
        )}
      </View>
    );
  }

  const onCheck = (row: VisitRow) =>
    check.mutate(
      { placeId: row.placeId, visitedAt: manualVisitedAt(startDate, row.day, row.time) },
      {
        onSuccess: (visit) =>
          toast.show('다녀온 곳으로 표시했어요', {
            action: {
              label: '되돌리기',
              onPress: () =>
                undo.mutate(visit, {
                  onError: () => toast.error('되돌리지 못했어요. 다시 시도해 주세요'),
                }),
            },
          }),
        onError: () => toast.error('표시하지 못했어요. 다시 시도해 주세요'),
      },
    );

  return (
    <VisitListView
      tripTitle={board.trip.title}
      people={board.trip.members.map((m) => ({
        name: m.user.nickname,
        imageUrl: m.user.profileImageUrl,
        me: m.user.id === board.myUserId,
      }))}
      days={days}
      summary={visitSummary(days)}
      checkingPlaceId={check.isPending ? (check.variables?.placeId ?? null) : null}
      onCheck={onCheck}
      // S34 평점·평가 작성은 평가 API(PUT /visits/{visitId}/review)가 생기면 연결한다
      onReview={() => toast.show('준비 중이에요')}
      // S30 사진 선택·업로드는 아직 없다
      onUpload={() => toast.show('준비 중이에요')}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  loading: { flex: 1 },
});
