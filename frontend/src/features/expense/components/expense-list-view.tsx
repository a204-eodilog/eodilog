import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, EmptyState, Header, Icon } from '@/components/ui';
import { formatWon } from '@/lib/format-number';
import { colors, layout, spacing, typography } from '@/theme';

import {
  addedAfterSettlement,
  changedAfterSettlement,
  formatTotalShort,
  payerLabel,
  splitLabel,
} from '../expense-rules';
import type { Expense, SettlementState, TripMember } from '../types';

import { ExpenseRow } from './expense-row';
import { SettlementChangedBox } from './settlement-changed-box';

export type ExpenseListViewProps = {
  tripTitle: string;
  members: TripMember[];
  myMemberId: string | null;
  expenses: Expense[];
  settlement: SettlementState | undefined;
  onAdd: () => void;
  onOpen: (expense: Expense) => void;
  /** [정산 계산]·[다시 계산] → S36 */
  onCalculate: () => void;
  /** [이전 정산 보기] → S36 재계산 필요 */
  onPreviousSettlement: () => void;
};

/**
 * S35 경비 목록. 상태: 기본 / 지출 없음 / 정산 후 지출 변경.
 * 목록에는 합계와 지출 줄만 둔다. 1명당 금액·사람별 낸 돈은 S36에만(디자인 결정 S35·S36).
 */
export function ExpenseListView({
  tripTitle,
  members,
  myMemberId,
  expenses,
  settlement,
  onAdd,
  onOpen,
  onCalculate,
  onPreviousSettlement,
}: ExpenseListViewProps) {
  const insets = useSafeAreaInsets();
  const changed = changedAfterSettlement(settlement);
  const total = expenses.reduce((sum, e) => sum + e.amountMinor, 0);
  const nameOf = (memberId: string) =>
    members.find((m) => m.id === memberId)?.user.nickname ?? '알 수 없음';

  return (
    <View style={styles.screen}>
      <Header
        title="경비"
        subtitle={tripTitle}
        subtitleIcon="trip"
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="지출 추가"
            hitSlop={8}
            onPress={onAdd}
            style={styles.headerButton}
          >
            <Icon name="plus" color={colors.text.default} />
          </Pressable>
        }
      />

      {expenses.length === 0 ? (
        <EmptyState
          icon="card"
          title="아직 입력한 지출이 없어요"
          description="함께 쓴 돈을 넣으면 나눠 계산해요"
          actionLabel="지출 추가"
          onAction={onAdd}
        />
      ) : (
        <>
          <FlatList
            data={expenses}
            keyExtractor={(e) => e.id}
            contentContainerStyle={styles.content}
            ItemSeparatorComponent={RowGap}
            ListHeaderComponent={
              <View style={styles.top}>
                {changed ? <SettlementChangedBox onPrevious={onPreviousSettlement} /> : null}
                <Card variant="filled" rounded="xl" style={styles.total}>
                  <Text style={[typography.caption, styles.sub]}>함께 쓴 돈</Text>
                  <Text style={[typography.title1, styles.text]}>
                    {changed ? formatWon(total) : formatTotalShort(total)}
                  </Text>
                </Card>
                <Text style={[typography.title3, styles.text, styles.listTitle]}>
                  지출 {expenses.length}건
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const payerName = nameOf(item.payerMemberId);
              return (
                <ExpenseRow
                  title={item.title}
                  amount={item.amountMinor}
                  payerName={payerName}
                  payerIsMe={item.payerMemberId === myMemberId}
                  payerText={payerLabel(payerName)}
                  splitText={splitLabel(item.participantMemberIds, members)}
                  addedAfterSettlement={addedAfterSettlement(item.id, settlement)}
                  onPress={() => onOpen(item)}
                />
              );
            }}
          />
          {/* 안드로이드 하단 버튼 줄(내비게이션 바) 높이만 주면 버튼이 바에 붙는다. 바 위로 16을 더 띄우고, 바가 없을 때는 원래 최소 여백을 쓴다 */}
          <View
            style={[
              styles.bottom,
              { paddingBottom: Math.max(insets.bottom + spacing[16], BOTTOM_GAP) },
            ]}
          >
            <Button
              label={changed ? '다시 계산' : '정산 계산'}
              weight="medium"
              onPress={onCalculate}
              leading={
                <Icon
                  name={changed ? 'refresh' : 'calculator'}
                  size={20}
                  color={colors.text.inverse}
                />
              }
              style={styles.calculate}
            />
          </View>
        </>
      )}
    </View>
  );
}

/** 아래 버튼 밑 여백(Figma 34). 기기 아래 안전 영역이 더 크면 그만큼 */
const BOTTOM_GAP = 34;

function RowGap() {
  return <View style={styles.rowGap} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  headerButton: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: layout.screenPaddingX, paddingTop: spacing[16] },
  top: { gap: spacing[20] },
  // 합계 상자 안쪽 여백 20, 글자 사이는 붙여 둔다
  total: { padding: spacing[20], gap: 0 },
  // 합계 상자와 목록 제목 사이 24(top의 gap 20 + 4), 제목과 목록 사이 8
  listTitle: { marginTop: spacing[4], marginBottom: spacing[8] },
  rowGap: { height: spacing[6] },
  bottom: {
    alignItems: 'flex-end',
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[12],
  },
  calculate: { alignSelf: 'flex-end', paddingLeft: spacing[20], paddingRight: spacing[24] },
  text: { color: colors.text.default },
  sub: { color: colors.text.icon },
});
