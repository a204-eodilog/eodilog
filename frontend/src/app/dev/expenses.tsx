import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, ConfirmSheet } from '@/components/ui';
import { ExpenseFormView } from '@/features/expense/components/expense-form-view';
import { ExpenseListView } from '@/features/expense/components/expense-list-view';
import { type ExpenseForm, toExpenseInput } from '@/features/expense/expense-rules';
import type { Expense, SettlementState, TripMember } from '@/features/expense/types';
import { colors, layout, spacing } from '@/theme';

/**
 * 개발용 S35 상태 보기. 서버 없이 값 문서(docs/design/screens/S35-expenses.md)의 예시 데이터로 그린다.
 * 앱 흐름에는 안 나오고 /dev/expenses로만 들어온다.
 */

function member(id: string, nickname: string, joinOrder: number): TripMember {
  return {
    id,
    role: joinOrder === 1 ? 'OWNER' : 'MEMBER',
    status: 'ACTIVE',
    joinOrder,
    user: {
      id: `u-${id}`,
      nickname,
      profileImageUrl: null,
      accountVisibility: 'PUBLIC',
      followingStatus: 'NONE',
      followedByStatus: 'NONE',
    },
  };
}

const MEMBERS = [
  member('jiwoo', '지우', 1),
  member('seoyeon', '서연', 2),
  member('minjun', '민준', 3),
];
const ME = 'jiwoo';
const ALL = MEMBERS.map((m) => m.id);

function expense(
  id: string,
  title: string,
  amountMinor: number,
  payerMemberId: string,
  participantMemberIds: string[],
): Expense {
  return {
    id,
    title,
    memo: null,
    amountMinor,
    currency: 'KRW',
    payerMemberId,
    participantMemberIds,
    spentAt: '2026-11-14T10:00:00Z',
    registeredByMemberId: payerMemberId,
    shares: [],
    version: 1,
  };
}

const EXPENSES = [
  expense('e1', '숙소 1박', 180_000, 'jiwoo', ALL),
  expense('e2', '서면 돼지국밥집', 33_000, 'minjun', ALL),
  expense('e3', '광안리 바다뷰 카페', 21_000, 'seoyeon', ['seoyeon', 'jiwoo']),
];
const TAXI = expense('e4', '부산역 가는 택시', 12_000, 'minjun', ALL);

const NO_SETTLEMENT: SettlementState = {
  current: null,
  currentExpenseVersion: 3,
  recalculationRequired: false,
};
const CHANGED: SettlementState = {
  current: { id: 's1', includedExpenses: EXPENSES.map((e) => ({ expenseId: e.id })) },
  currentExpenseVersion: 4,
  recalculationRequired: true,
};

type Example = 'list' | 'empty' | 'changed' | 'create' | 'failed' | 'edit' | 'view';

export default function ExpenseStates() {
  const [view, setView] = useState<Example | null>(null);
  const [form, setForm] = useState<ExpenseForm>({
    amount: '21,000',
    title: '광안리 바다뷰 카페',
    payerMemberId: 'seoyeon',
    participantMemberIds: ['jiwoo', 'seoyeon'],
  });
  const [confirm, setConfirm] = useState(false);
  const back = () => setView(null);

  if (view === 'list' || view === 'empty' || view === 'changed') {
    return (
      <ExpenseListView
        tripTitle="겨울 여행"
        members={MEMBERS}
        myMemberId={ME}
        expenses={view === 'empty' ? [] : view === 'changed' ? [TAXI, ...EXPENSES] : EXPENSES}
        settlement={view === 'changed' ? CHANGED : NO_SETTLEMENT}
        onAdd={() => setView('create')}
        onOpen={(e) => setView(e.payerMemberId === ME ? 'edit' : 'view')}
        onCalculate={back}
        onPreviousSettlement={back}
      />
    );
  }

  if (view) {
    const result = toExpenseInput(form);
    return (
      <>
        <ExpenseFormView
          mode={view === 'failed' ? 'create' : view}
          tripTitle="겨울 여행"
          members={MEMBERS}
          myMemberId={ME}
          form={form}
          onChange={(next) => setForm((prev) => ({ ...prev, ...next }))}
          onClose={back}
          onSave={back}
          canSave={'input' in result}
          amountError={
            'problem' in result && result.problem === 'amountTooLarge'
              ? '금액이 너무 커요'
              : undefined
          }
          failed={view === 'failed'}
          onDelete={view === 'edit' ? () => setConfirm(true) : undefined}
        />
        <ConfirmSheet
          visible={confirm}
          onClose={() => setConfirm(false)}
          onConfirm={() => setConfirm(false)}
          title="이 지출을 지울까요?"
          description="지우면 정산을 다시 계산해야 해요"
          confirmLabel="지우기"
          confirmIcon="trash"
        />
      </>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.menu} style={styles.screen}>
      <View style={styles.row}>
        <Button label="기본" variant="neutral" onPress={() => setView('list')} />
        <Button label="지출 없음" variant="neutral" onPress={() => setView('empty')} />
        <Button label="정산 후 지출 변경" variant="neutral" onPress={() => setView('changed')} />
      </View>
      <View style={styles.row}>
        <Button label="지출 추가" variant="neutral" onPress={() => setView('create')} />
        <Button label="지출 저장 실패" variant="neutral" onPress={() => setView('failed')} />
        <Button label="내 지출 수정" variant="neutral" onPress={() => setView('edit')} />
        <Button label="남의 지출 보기" variant="neutral" onPress={() => setView('view')} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  menu: { padding: layout.screenPaddingX, paddingTop: 80, gap: spacing[16] },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[8] },
});
