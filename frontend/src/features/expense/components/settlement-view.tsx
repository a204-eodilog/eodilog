import { SCROLL_DECELERATION } from '@/theme/scroll';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar, AvatarGroup, Button, Header, Icon, Tag } from '@/components/ui';
import { formatWon } from '@/lib/format-number';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { payerLabel, splitLabel } from '../expense-rules';
import { balanceDirection, formatCalculatedAt } from '../settlement-rules';
import type { Settlement, TripMember } from '../types';

export type SettlementViewProps = {
  tripTitle: string;
  /** 나간 동행까지. 정산에는 나간 사람도 남는다 */
  members: TripMember[];
  myMemberId: string | null;
  settlement: Settlement;
  /** 재계산 필요: 지난 계산 뒤 지출이 바뀌었다. 안내 상자 + 이전 결과를 흐리게 */
  stale?: boolean;
  /** 재계산 필요 안내 둘째 줄. "정산 뒤 택시 12,000원이 추가됐어요" */
  staleReason?: string;
  onRecalculate?: () => void;
  recalculating?: boolean;
};

/** S36 상단 바. 오른쪽에 지금 동행 얼굴 묶음. 계산 중·계산 실패에서도 그대로 보인다 */
export function SettlementHeader({
  tripTitle,
  members,
  myMemberId,
}: {
  tripTitle?: string;
  members: TripMember[];
  myMemberId: string | null;
}) {
  const active = members
    .filter((m) => m.status === 'ACTIVE')
    .sort((a, b) => a.joinOrder - b.joinOrder);
  return (
    <Header
      title="정산 결과"
      subtitle={tripTitle}
      subtitleIcon="trip"
      right={
        active.length > 0 ? (
          <AvatarGroup
            people={active.map((m) => ({ name: m.user.nickname, me: m.id === myMemberId }))}
          />
        ) : null
      }
    />
  );
}

/**
 * S36 정산 결과. 상태: 기본 / 재계산 필요.
 * 누가 누구에게 얼마 보낼지 계산만 보여 준다. 송금·완료 표시는 없다(사용자 흐름 7.3).
 */
export function SettlementView({
  tripTitle,
  members,
  myMemberId,
  settlement,
  stale = false,
  staleReason,
  onRecalculate,
  recalculating = false,
}: SettlementViewProps) {
  const member = (id: string) => members.find((m) => m.id === id);
  const nameOf = (id: string) => member(id)?.user.nickname ?? '알 수 없음';

  const result = (
    <>
      <View style={styles.summary}>
        <Text style={[typography.title1, styles.text]}>
          {formatWon(settlement.totalAmountMinor)}을 {settlement.members.length}명이 나눴어요
        </Text>
        <View style={styles.inline}>
          <Icon name="clock" size={16} color={colors.text.icon} />
          <Text style={[typography.caption, styles.sub]}>
            {formatCalculatedAt(settlement.calculatedAt)}
          </Text>
        </View>
      </View>

      <View style={styles.transfers}>
        <Text style={[typography.title3, styles.text]}>누가 누구에게 얼마</Text>
        {settlement.transfers.map((t) => (
          <View key={t.id} style={[styles.transfer, stale && styles.transferWithFaces]}>
            {stale ? (
              <View style={styles.faces}>
                <Avatar
                  name={nameOf(t.fromMemberId)}
                  me={t.fromMemberId === myMemberId}
                  size={32}
                />
                <Icon name="arrow-right" size={18} color={colors.text.icon} />
                <Avatar name={nameOf(t.toMemberId)} me={t.toMemberId === myMemberId} size={32} />
              </View>
            ) : null}
            <Text style={[typography.body, styles.text, styles.grow]} numberOfLines={1}>
              {nameOf(t.fromMemberId)} → {nameOf(t.toMemberId)}
            </Text>
            <Text style={[typography.bodyBold, styles.text]}>{formatWon(t.amountMinor)}</Text>
          </View>
        ))}
        <View style={styles.note}>
          <Icon name="info" size={16} color={colors.text.icon} />
          <Text style={[typography.caption, styles.sub]}>송금은 각자 해요</Text>
        </View>
      </View>

      <View style={styles.members}>
        <Text style={[typography.title3, styles.text]}>구성원별 부담액</Text>
        <View style={styles.memberList}>
          {settlement.members.map((m) => {
            const direction = balanceDirection(m.balanceMinor);
            const receive = direction === 'receive';
            return (
              <View key={m.memberId} style={styles.memberRow}>
                <Avatar name={nameOf(m.memberId)} me={m.memberId === myMemberId} size={36} />
                <View style={styles.grow}>
                  <Text style={[typography.bodyBold, styles.text]}>{nameOf(m.memberId)}</Text>
                  <View style={styles.memberMeta}>
                    <View style={styles.inline}>
                      <Icon name="card" size={16} color={colors.text.icon} />
                      <Text style={[typography.caption, styles.sub]}>
                        낸 돈 {formatWon(m.paidMinor)}
                      </Text>
                    </View>
                    <View style={styles.inline}>
                      <Icon name="people" size={16} color={colors.text.icon} />
                      <Text style={[typography.caption, styles.sub]}>
                        부담 {formatWon(m.owedMinor)}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={styles.balance}>
                  <Text style={[typography.bodyBold, receive ? styles.brand : styles.text]}>
                    {formatWon(Math.abs(m.balanceMinor))}
                  </Text>
                  <Text style={[typography.caption, receive ? styles.brand : styles.sub]}>
                    {direction === 'receive'
                      ? '받아요'
                      : direction === 'send'
                        ? '보내요'
                        : '없어요'}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </>
  );

  return (
    <View style={styles.screen}>
      <SettlementHeader tripTitle={tripTitle} members={members} myMemberId={myMemberId} />
      <ScrollView decelerationRate={SCROLL_DECELERATION} contentContainerStyle={styles.content}>
        {stale ? (
          <>
            <View style={styles.staleBox}>
              <View style={styles.staleRow}>
                <View style={styles.iconCircle}>
                  <Icon name="refresh" size={22} color={colors.brand.primary} />
                </View>
                <View style={styles.grow}>
                  <Text style={[typography.bodyBold, styles.text]}>다시 계산해야 해요</Text>
                  {staleReason ? (
                    <Text style={[typography.caption, styles.sub]}>{staleReason}</Text>
                  ) : null}
                </View>
              </View>
              <Button
                label="다시 계산"
                icon="refresh"
                weight="medium"
                size="md"
                onPress={onRecalculate}
                loading={recalculating}
                style={styles.recalculate}
              />
            </View>
            <View style={styles.previous}>
              <Tag label="이전 정산 · 지금과 달라요" tone="line" />
              {result}
            </View>
          </>
        ) : (
          <>
            {result}
            <View style={styles.included}>
              <View style={styles.includedHead}>
                <Text style={[typography.title3, styles.text]}>
                  포함한 지출 {settlement.includedExpenses.length}건
                </Text>
                <Text style={[typography.caption, styles.sub]}>
                  합계 {formatWon(settlement.totalAmountMinor)}
                </Text>
              </View>
              <View style={styles.includedList}>
                {settlement.includedExpenses.map((e) => (
                  <View key={e.expenseId} style={styles.includedRow}>
                    <View style={styles.grow}>
                      <Text style={[typography.body, styles.text]} numberOfLines={1}>
                        {e.title}
                      </Text>
                      <Text style={[typography.caption, styles.sub]} numberOfLines={1}>
                        {payerLabel(nameOf(e.payerMemberId))} ·{' '}
                        {splitLabel(
                          e.shares.map((s) => s.memberId),
                          members,
                          '명이 똑같이',
                        )}
                      </Text>
                    </View>
                    <Text style={[typography.bodyMedium, styles.text]}>
                      {formatWon(e.amountMinor)}
                    </Text>
                  </View>
                ))}
              </View>
              <View style={[styles.inline, styles.roundingNote]}>
                <Icon name="calculator" size={16} color={colors.text.icon} />
                <Text style={[typography.caption, styles.text]}>
                  1명 금액은 10원 단위로 올려 계산했어요
                </Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  content: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[16],
    paddingBottom: spacing[32],
    gap: spacing[28],
  },
  text: { color: colors.text.default },
  sub: { color: colors.text.icon },
  brand: { color: colors.brand.primaryDark },
  grow: { flex: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  summary: { gap: spacing[2] },
  transfers: { gap: spacing[10] },
  transfer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[10],
    paddingVertical: spacing[16],
    paddingHorizontal: spacing[18],
    borderRadius: radius.lg,
    backgroundColor: colors.surface.default,
  },
  // 재계산 필요 상태의 줄: 높이 68, 안쪽 18/20, 앞에 얼굴 → 얼굴
  transferWithFaces: {
    minHeight: 68,
    paddingVertical: spacing[18],
    paddingHorizontal: spacing[20],
  },
  faces: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  note: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
  members: { gap: spacing[12] },
  memberList: { gap: spacing[8] },
  memberRow: { flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: spacing[14] },
  memberMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing[12] },
  balance: { alignItems: 'flex-end' },
  included: {
    padding: spacing[18],
    gap: spacing[6],
    borderRadius: radius.xl,
    backgroundColor: colors.surface.default,
  },
  includedHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  includedList: { gap: spacing[12] },
  includedRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: spacing[12] },
  roundingNote: { marginTop: spacing[4] },
  staleBox: {
    marginTop: spacing[4],
    padding: spacing[20],
    gap: spacing[12],
    borderRadius: radius.xl,
    backgroundColor: colors.brand.primaryBg,
  },
  staleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[14] },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recalculate: { alignSelf: 'flex-end' },
  // 이전 결과는 흐리게(Figma 0.48), 섹션 사이 28
  previous: { opacity: 0.48, gap: spacing[28] },
});
