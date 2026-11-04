import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, ConfirmSheet } from '@/components/ui';
import { ExpenseFormView } from '@/features/expense/components/expense-form-view';
import { ExpenseListView } from '@/features/expense/components/expense-list-view';
import { SettlementFailedView } from '@/features/expense/components/settlement-failed-view';
import { SettlementHeader, SettlementView } from '@/features/expense/components/settlement-view';
import { type ExpenseForm, toExpenseInput } from '@/features/expense/expense-rules';
import { recalculationReason } from '@/features/expense/settlement-rules';
import type { Expense, Settlement, SettlementState, TripMember } from '@/features/expense/types';
import { colors, layout, spacing } from '@/theme';

/**
 * 개발용 S35·S36 상태 보기. 서버 없이 값 문서(S35-expenses.md·S36-settlement.md)의 예시 데이터로 그린다.
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
/** S36 값 문서 예시: 지우 98,500원 받아요, 민준 38,000원·서연 60,500원 보내요 */
const SETTLEMENT: Settlement = {
  id: 's1',
  expenseVersion: 3,
  stale: false,
  totalAmountMinor: 234_000,
  includedExpenses: EXPENSES.map((e) => ({
    expenseId: e.id,
    expenseVersion: e.version,
    title: e.title,
    amountMinor: e.amountMinor,
    payerMemberId: e.payerMemberId,
    shares: e.participantMemberIds.map((memberId) => ({ memberId, amountMinor: 0 })),
  })),
  members: [
    { memberId: 'jiwoo', paidMinor: 180_000, owedMinor: 81_500, balanceMinor: 98_500 },
    { memberId: 'seoyeon', paidMinor: 21_000, owedMinor: 81_500, balanceMinor: -60_500 },
    { memberId: 'minjun', paidMinor: 33_000, owedMinor: 71_000, balanceMinor: -38_000 },
  ],
  transfers: [
    { id: 't1', fromMemberId: 'minjun', toMemberId: 'jiwoo', amountMinor: 38_000 },
    { id: 't2', fromMemberId: 'seoyeon', toMemberId: 'jiwoo', amountMinor: 60_500 },
  ],
  calculatedAt: new Date(2026, 10, 16, 21, 10).toISOString(),
};
const CHANGED: SettlementState = {
  current: { ...SETTLEMENT, stale: true },
  currentExpenseVersion: 4,
  recalculationRequired: true,
};

type Example =
  | 'list'
  | 'empty'
  | 'changed'
  | 'create'
  | 'failed'
  | 'conflict'
  | 'edit'
  | 'view'
  | 'settlement'
  | 'stale'
  | 'calcFailed';

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

  if (view === 'settlement' || view === 'stale') {
    return (
      <SettlementView
        tripTitle="겨울 여행"
        members={MEMBERS}
        myMemberId={ME}
        settlement={SETTLEMENT}
        stale={view === 'stale'}
        staleReason={recalculationReason(SETTLEMENT, [TAXI, ...EXPENSES])}
        onRecalculate={back}
      />
    );
  }

  if (view === 'calcFailed') {
    return (
      <View style={styles.screen}>
        <SettlementHeader tripTitle="겨울 여행" members={MEMBERS} myMemberId={ME} />
        <SettlementFailedView expenseCount={EXPENSES.length} onRetry={back} onBack={back} />
      </View>
    );
  }

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
          mode={view === 'failed' ? 'create' : view === 'conflict' ? 'edit' : view}
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
          failed={view === 'failed' || view === 'conflict'}
          conflict={view === 'conflict'}
          onDelete={view === 'edit' || view === 'conflict' ? () => setConfirm(true) : undefined}
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
        <Button label="먼저 바뀐 지출" variant="neutral" onPress={() => setView('conflict')} />
        <Button label="내 지출 수정" variant="neutral" onPress={() => setView('edit')} />
        <Button label="남의 지출 보기" variant="neutral" onPress={() => setView('view')} />
      </View>
      <View style={styles.row}>
        <Button label="정산 결과" variant="neutral" onPress={() => setView('settlement')} />
        <Button label="재계산 필요" variant="neutral" onPress={() => setView('stale')} />
        <Button label="계산 실패" variant="neutral" onPress={() => setView('calcFailed')} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  menu: { padding: layout.screenPaddingX, paddingTop: 80, gap: spacing[16] },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[8] },
});
