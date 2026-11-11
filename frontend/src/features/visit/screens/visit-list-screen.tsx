import { useMutationState } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Spinner } from '@/components/ui/spinner';

import { CenterNotice, Header, toast } from '@/components/ui';
import { colors } from '@/theme';

import { VisitListView } from '../components/visit-list-view';
import { useVisitBoard } from '../hooks/use-visit-board';
import { undoVisitKey, useCheckVisit, useUndoVisit } from '../hooks/use-visit-mutations';
import type { Visit } from '../types';
import { buildVisitDays, manualVisitedAt, visitSummary, type VisitRow } from '../visit-rules';

/**
 * S33 방문 장소 평가 목록. 여행 상세(S17)의 '평가'에서 연다.
 * 사진 방문 후보(visit-candidates) API가 아직 없어서 코스 장소를 '다녀옴'으로 직접 체크하고,
 * [평가하기]·내 점수로 S34에 간다. [사진 올리기]는 S30 사진 선택·업로드로 간다
 */
export function VisitListScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const board = useVisitBoard(tripId);
  const check = useCheckVisit(tripId);
  const undo = useUndoVisit(tripId);
  // 되돌리는 중인 장소. 지우기가 끝나기 전에 같은 장소를 다시 체크하면 DELETE가 새 체크를 지울 수 있어 막는다
  const undoingPlaceIds = useMutationState({
    filters: { mutationKey: undoVisitKey(tripId), status: 'pending' },
    select: (m) => (m.state.variables as Visit).placeId,
  });

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
          <Spinner style={styles.loading} color={colors.brand.primary} />
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

  const undoVisit = (visit: Visit) =>
    undo.mutate(visit, {
      onError: () =>
        toast.error('되돌리지 못했어요', {
          action: { label: '다시 시도', onPress: () => undoVisit(visit) },
        }),
    });

  const busyPlaceIds = [
    ...undoingPlaceIds,
    ...(check.isPending && check.variables ? [check.variables.placeId] : []),
  ];

  const onCheck = (row: VisitRow) =>
    check.mutate(
      { placeId: row.placeId, visitedAt: manualVisitedAt(startDate, row.day, row.time) },
      {
        onSuccess: (visit) =>
          toast.show('다녀온 곳으로 표시했어요', {
            action: { label: '되돌리기', onPress: () => undoVisit(visit) },
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
      busyPlaceIds={busyPlaceIds}
      onCheck={onCheck}
      // S34 평점·평가 작성. 사진 방문 후보(방문 확정 전)는 아직 없어 늘 방문이 있는 줄에서만 열린다
      onReview={(row) => {
        if (!row.visit) return;
        router.push({
          pathname: '/trips/[tripId]/visits/[visitId]',
          params: { tripId, visitId: row.visit.id },
        });
      }}
      onUpload={() => router.push(`/trips/${tripId}/photos/upload`)}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  loading: { flex: 1 },
});
