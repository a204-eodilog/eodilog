import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Spinner } from '@/components/ui/spinner';

import { ErrorState } from '@/components/ui';
import { colors } from '@/theme';

import { SettlementFailedView } from '../components/settlement-failed-view';
import { SettlementHeader, SettlementView } from '../components/settlement-view';
import { useCalculateSettlement } from '../hooks/use-calculate-settlement';
import { useExpenseBoard } from '../hooks/use-expense-board';
import { recalculationReason } from '../settlement-rules';

/**
 * S36 정산 결과. S35 [정산 계산]·[다시 계산]은 `?calculate=1`로 와서 열리자마자 계산하고,
 * [이전 정산 보기]는 계산 없이 지금 결과(재계산 필요)를 보여 준다.
 * 계산한 적이 없으면 들어오자마자 계산한다.
 */
export function SettlementScreen() {
  const { tripId, calculate } = useLocalSearchParams<{ tripId: string; calculate?: string }>();
  const board = useExpenseBoard(tripId);
  const calc = useCalculateSettlement(tripId);
  const started = useRef(false);

  const needsCalculation = calculate === '1' || (board.settlement && !board.settlement.current);
  useEffect(() => {
    if (started.current || board.isLoading || board.error || !needsCalculation) return;
    started.current = true;
    calc.mutate();
    // 뒤로 왔다가 다시 들어와도 또 계산하지 않게 주소에서 뺀다
    router.setParams({ calculate: undefined });
  }, [board.isLoading, board.error, needsCalculation, calc]);

  const header = (
    <SettlementHeader
      tripTitle={board.trip?.title}
      members={board.members}
      myMemberId={board.myMemberId}
    />
  );

  if (calc.isError) {
    return (
      <View style={styles.screen}>
        {header}
        <SettlementFailedView
          expenseCount={board.expenses.length}
          onRetry={() => calc.mutate()}
          retrying={calc.isPending}
          onBack={() => router.back()}
        />
      </View>
    );
  }

  if (board.error && !calc.isPending) {
    return (
      <View style={styles.screen}>
        {header}
        <ErrorState title="정산을 불러오지 못했어요" onRetry={board.refetch} />
      </View>
    );
  }

  const settlement = board.settlement?.current;
  const stale = Boolean(board.settlement?.recalculationRequired);
  // "계산 중" 상태는 피그마에 없어 불러오기와 같이 가운데 돌아가는 표시만 둔다.
  // 재계산 필요 화면에서 [다시 계산]을 누른 경우는 화면을 두고 버튼만 돌아가게 한다
  const calculatingFresh = calc.isPending && !stale;
  if (board.isLoading || !board.trip || !settlement || calculatingFresh) {
    return (
      <View style={styles.screen}>
        {header}
        <Spinner style={styles.loading} color={colors.brand.primary} />
      </View>
    );
  }

  return (
    <SettlementView
      tripTitle={board.trip.title}
      members={board.members}
      myMemberId={board.myMemberId}
      settlement={settlement}
      stale={stale}
      staleReason={stale ? recalculationReason(settlement, board.expenses) : undefined}
      onRecalculate={() => calc.mutate()}
      recalculating={calc.isPending}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  loading: { flex: 1 },
});
