import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ConfirmSheet, ErrorState, Header } from '@/components/ui';
import { SkeletonList } from '@/components/ui/skeleton';
import { formatThousands } from '@/lib/format-number';
import { colors } from '@/theme';

import { ExpenseFormView } from '../components/expense-form-view';
import { type ExpenseForm, toExpenseInput } from '../expense-rules';
import { useExpenseBoard } from '../hooks/use-expense-board';
import { expenseFailure, useDeleteExpense, useSaveExpense } from '../hooks/use-expense-mutations';
import type { Expense, TripMember } from '../types';

/**
 * S35 지출 추가(`/trips/{tripId}/expenses/new`)와 지출 상세(`/trips/{tripId}/expenses/{expenseId}`).
 * 내가 등록한 지출이면 고치고 지울 수 있고, 남이 등록한 지출은 보기만 한다(방장도 못 고친다).
 */
export function ExpenseFormScreen() {
  const { tripId, expenseId } = useLocalSearchParams<{ tripId: string; expenseId?: string }>();
  const board = useExpenseBoard(tripId);
  const expense = expenseId ? board.expenses.find((e) => e.id === expenseId) : undefined;
  const missing = Boolean(expenseId) && !board.isLoading && !expense;

  if (board.isLoading || board.error || !board.trip || missing) {
    return (
      <View style={styles.screen}>
        <Header close title={expenseId ? '지출' : '지출 추가'} />
        {board.isLoading ? (
          <SkeletonList style={styles.loading} />
        ) : missing ? (
          <ErrorState
            title="지출을 찾을 수 없어요"
            description="이미 지워졌을 수 있어요"
            retryLabel="경비 목록 보기"
            onRetry={() => router.back()}
          />
        ) : (
          <ErrorState title="경비를 불러오지 못했어요" onRetry={board.refetch} />
        )}
      </View>
    );
  }

  return (
    <ExpenseEditor
      tripId={tripId}
      tripTitle={board.trip.title}
      members={board.members}
      myMemberId={board.myMemberId}
      expense={expense}
    />
  );
}

function ExpenseEditor({
  tripId,
  tripTitle,
  members,
  myMemberId,
  expense,
}: {
  tripId: string;
  tripTitle: string;
  members: TripMember[];
  myMemberId: string | null;
  expense?: Expense;
}) {
  const mode = !expense ? 'create' : expense.registeredByMemberId === myMemberId ? 'edit' : 'view';
  const active = members.filter((m) => m.status === 'ACTIVE');
  // 나간 동행은 새로 넣을 수 없어서, 이미 이 지출에 들어 있는 사람만 함께 보여 준다
  const involved = new Set(expense ? [expense.payerMemberId, ...expense.participantMemberIds] : []);
  const choosable = members.filter((m) => m.status === 'ACTIVE' || involved.has(m.id));

  const [form, setForm] = useState<ExpenseForm>(() =>
    expense
      ? {
          amount: formatThousands(expense.amountMinor),
          title: expense.title,
          payerMemberId: expense.payerMemberId,
          participantMemberIds: expense.participantMemberIds,
        }
      : // 새 지출은 내가 내고 지금 동행 모두가 나누는 것에서 시작한다
        {
          amount: '',
          title: '',
          payerMemberId: myMemberId,
          participantMemberIds: active.map((m) => m.id),
        },
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useSaveExpense(tripId, expense);
  const remove = useDeleteExpense(tripId);

  const result = toExpenseInput(form);
  const amountError =
    'problem' in result && result.problem === 'amountTooLarge' ? '금액이 너무 커요' : undefined;

  return (
    <>
      <ExpenseFormView
        mode={mode}
        tripTitle={tripTitle}
        members={choosable}
        myMemberId={myMemberId}
        form={form}
        onChange={(next) => setForm((prev) => ({ ...prev, ...next }))}
        onClose={() => router.back()}
        onSave={() => {
          if ('input' in result) save.mutate(result.input, { onSuccess: () => router.back() });
        }}
        canSave={'input' in result}
        amountError={amountError}
        saving={save.isPending}
        failed={save.isError}
        conflict={save.isError && expenseFailure(save.error) === 'conflict'}
        onDelete={mode === 'edit' ? () => setConfirmDelete(true) : undefined}
      />
      {expense ? (
        <ConfirmSheet
          visible={confirmDelete}
          // 닫았다 다시 열 때 지난 실패가 남지 않게 지운다
          onClose={() => {
            setConfirmDelete(false);
            remove.reset();
          }}
          onConfirm={() =>
            remove.mutate(expense, {
              onSuccess: () => {
                setConfirmDelete(false);
                router.back();
              },
            })
          }
          title="이 지출을 지울까요?"
          description="지우면 정산을 다시 계산해야 해요"
          confirmLabel={remove.isError ? '다시 시도' : '지우기'}
          confirmIcon={remove.isError ? 'refresh' : 'trash'}
          loading={remove.isPending}
          error={
            !remove.isError
              ? undefined
              : expenseFailure(remove.error) === 'conflict'
                ? '그 사이 지출이 바뀌었어요'
                : '지우지 못했어요'
          }
          errorDescription="다시 시도해 주세요"
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  loading: { flex: 1 },
});
