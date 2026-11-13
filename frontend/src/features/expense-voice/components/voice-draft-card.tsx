import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, RoundCheck } from '@/components/ui';
import { type TripMember, splitLabel } from '@/features/expense';
import { formatWon, parseAmount } from '@/lib/format-number';
import { colors, radius, spacing, typography } from '@/theme';

import type { DraftItem, DraftProblem } from '../voice-rules';

export type VoiceDraftCardProps = {
  item: DraftItem;
  members: TripMember[];
  myMemberId: string | null;
  problems: DraftProblem[];
  onToggle: () => void;
  onPress: () => void;
  disabled?: boolean;
};

/** N11 초안 카드. 선택 · 항목 이름 · 금액 · 낸 사람 · 나눌 사람 · 나온 말 · 확인 필요 */
export function VoiceDraftCard({
  item,
  members,
  myMemberId,
  problems,
  onToggle,
  onPress,
  disabled = false,
}: VoiceDraftCardProps) {
  const f = item.form;
  const amount = parseAmount(f.amount);
  const payer = members.find((m) => m.id === f.payerMemberId);
  const payerName = payer
    ? `${payer.user.nickname}${payer.id === myMemberId ? ' (나)' : ''}`
    : '고르지 않음';
  const split =
    f.participantMemberIds.length > 0 ? splitLabel(f.participantMemberIds, members) : '고르지 않음';
  const warn = item.selected && problems.length > 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="눌러서 고치기"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.card, warn && styles.cardWarn, pressed && styles.pressed]}
    >
      <View style={styles.top}>
        <RoundCheck
          checked={item.selected}
          onChange={onToggle}
          disabled={disabled}
          accessibilityLabel={`${f.title || '이름 없는 지출'} 저장하기`}
        />
        <Text style={[typography.bodyBold, styles.text, styles.flex]} numberOfLines={1}>
          {f.title.trim() || '이름 없음'}
        </Text>
        <Text style={[typography.bodyBold, amount ? styles.text : styles.muted]}>
          {amount ? formatWon(amount) : '금액 없음'}
        </Text>
        {/* 카드를 누르면 고칠 수 있다는 것을 보이게 한다(2026-11-13 사용자 요청). 누르는 곳은 카드 전체 */}
        <Icon name="pencil" size={18} color={colors.text.icon} />
      </View>
      <View style={styles.indent}>
        <Line label="낸 사람" value={payerName} missing={!payer} />
        <Line label="나눌 사람" value={split} missing={f.participantMemberIds.length === 0} />
        <View style={styles.quote}>
          <Text style={[typography.caption, styles.sub]}>“{item.segment}”</Text>
        </View>
        {item.selected
          ? problems.map((p) => (
              <View key={`${p.field}-${p.message}`} style={styles.tag}>
                <Icon name="alert" size={14} color={colors.status.danger} />
                <Text style={[typography.captionMedium, styles.danger]}>{p.message}</Text>
              </View>
            ))
          : null}
      </View>
    </Pressable>
  );
}

function Line({ label, value, missing }: { label: string; value: string; missing: boolean }) {
  return (
    <Text style={[typography.caption, missing ? styles.muted : styles.sub]} numberOfLines={1}>
      {label}
      {'  '}
      {value}
    </Text>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing[10],
    padding: spacing[16],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line.default,
    backgroundColor: colors.surface.white,
  },
  cardWarn: { borderColor: colors.status.danger },
  pressed: { opacity: 0.7 },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing[10] },
  flex: { flex: 1 },
  indent: { paddingLeft: 34, gap: spacing[4] },
  quote: {
    marginTop: spacing[4],
    paddingHorizontal: spacing[12],
    paddingVertical: spacing[8],
    borderRadius: radius.md,
    backgroundColor: colors.surface.default,
  },
  tag: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
    marginTop: spacing[4],
    paddingLeft: spacing[8],
    paddingRight: spacing[10],
    paddingVertical: spacing[4],
    borderRadius: radius.full,
    backgroundColor: colors.status.dangerBg,
  },
  text: { color: colors.text.default },
  sub: { color: colors.text.icon },
  muted: { color: colors.text.muted },
  danger: { color: colors.status.danger },
});
