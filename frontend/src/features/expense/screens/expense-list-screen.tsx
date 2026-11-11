import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Spinner } from '@/components/ui/spinner';

import { ErrorState, Header } from '@/components/ui';
import { colors } from '@/theme';

import { ExpenseListView } from '../components/expense-list-view';
import { useExpenseBoard } from '../hooks/use-expense-board';

/** S35 경비 목록. 여행 상세(S17)의 '경비'에서 연다 */
export function ExpenseListScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const board = useExpenseBoard(tripId);

  if (board.isLoading || board.error || !board.trip) {
    return (
      <View style={styles.screen}>
        <Header title="경비" />
        {board.isLoading ? (
          <Spinner style={styles.loading} color={colors.brand.primary} />
        ) : (
          <ErrorState title="경비를 불러오지 못했어요" onRetry={board.refetch} />
        )}
      </View>
    );
  }

  return (
    <ExpenseListView
      tripTitle={board.trip.title}
      members={board.members}
      myMemberId={board.myMemberId}
      expenses={board.expenses}
      settlement={board.settlement}
      onAdd={() => router.push({ pathname: '/trips/[tripId]/expenses/new', params: { tripId } })}
      onOpen={(expense) =>
        router.push({
          pathname: '/trips/[tripId]/expenses/[expenseId]',
          params: { tripId, expenseId: expense.id },
        })
      }
      // 계산(POST /settlements)은 S36이 열리면서 한다. 계산 중·실패 상태가 S36에 있다
      onCalculate={() =>
        router.push({ pathname: '/trips/[tripId]/settlement', params: { tripId, calculate: '1' } })
      }
      onPreviousSettlement={() =>
        router.push({ pathname: '/trips/[tripId]/settlement', params: { tripId } })
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  loading: { flex: 1 },
});
