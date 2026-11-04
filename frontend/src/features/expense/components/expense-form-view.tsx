import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Header, Icon, TextField } from '@/components/ui';
import { formatThousands } from '@/lib/format-number';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { AMOUNT_MAX_LENGTH, type ExpenseForm, TITLE_MAX_LENGTH } from '../expense-rules';
import type { TripMember } from '../types';

import { MemberChip } from './member-chip';

export type ExpenseFormMode = 'create' | 'edit' | 'view';

const TITLES: Record<ExpenseFormMode, string> = {
  create: '지출 추가',
  edit: '지출 수정',
  view: '지출',
};

export type ExpenseFormViewProps = {
  /** create 지출 추가 / edit 내가 등록한 지출 / view 남이 등록한 지출(보기만) */
  mode: ExpenseFormMode;
  tripTitle: string;
  /** 고를 수 있는 동행. 지금 여행에 있는 사람 + 이 지출에 이미 들어 있던 나간 사람 */
  members: TripMember[];
  myMemberId: string | null;
  form: ExpenseForm;
  onChange: (next: Partial<ExpenseForm>) => void;
  onClose: () => void;
  onSave: () => void;
  /** 규칙에 맞아 저장할 수 있는지. 금액 0·이름 없음이면 누를 수 없다 */
  canSave: boolean;
  /** 금액 칸 아래 오류. 상한을 넘었을 때 */
  amountError?: string;
  saving?: boolean;
  /** 저장 실패. 맨 위에 안내 상자, 버튼은 [다시 저장] */
  failed?: boolean;
  /** edit에서만. [삭제] → S50 확인 시트 */
  onDelete?: () => void;
};

/** S35 지출 추가·수정 화면. 상태: 지출 추가 / 지출 저장 실패 */
export function ExpenseFormView({
  mode,
  tripTitle,
  members,
  myMemberId,
  form,
  onChange,
  onClose,
  onSave,
  canSave,
  amountError,
  saving = false,
  failed = false,
  onDelete,
}: ExpenseFormViewProps) {
  const insets = useSafeAreaInsets();
  const readOnly = mode === 'view';
  const ordered = [...members].sort((a, b) => a.joinOrder - b.joinOrder);
  const chosen = new Set(form.participantMemberIds);

  const toggleParticipant = (id: string) =>
    onChange({
      participantMemberIds: chosen.has(id)
        ? form.participantMemberIds.filter((x) => x !== id)
        : ordered.filter((m) => chosen.has(m.id) || m.id === id).map((m) => m.id),
    });

  return (
    <View style={styles.screen}>
      <Header
        close
        title={TITLES[mode]}
        subtitle={tripTitle}
        subtitleIcon="trip"
        onBack={onClose}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {failed ? <SaveFailedBox /> : null}

          <Section title="금액">
            <TextField
              variant="filled"
              large
              value={form.amount}
              onChangeText={(v) => onChange({ amount: formatThousands(v) })}
              keyboardType="number-pad"
              placeholder="0"
              maxLength={AMOUNT_MAX_LENGTH}
              hideCount
              editable={!readOnly}
              error={amountError}
              accessibilityLabel="금액"
              style={styles.amount}
              trailing={<Text style={[typography.title1, styles.text]}>원</Text>}
            />
          </Section>

          <Section title="낸 사람">
            <View style={styles.chips}>
              {ordered.map((m) => (
                <MemberChip
                  key={m.id}
                  name={m.user.nickname}
                  me={m.id === myMemberId}
                  selected={form.payerMemberId === m.id}
                  disabled={readOnly}
                  onPress={() => onChange({ payerMemberId: m.id })}
                />
              ))}
            </View>
          </Section>

          <Section
            title="나눌 사람"
            right={<Text style={[typography.caption, styles.sub]}>{chosen.size}명 선택</Text>}
          >
            <View style={styles.chips}>
              {ordered.map((m) => (
                <MemberChip
                  key={m.id}
                  name={m.user.nickname}
                  me={m.id === myMemberId}
                  multiple
                  selected={chosen.has(m.id)}
                  disabled={readOnly}
                  onPress={() => toggleParticipant(m.id)}
                />
              ))}
            </View>
            {/* Figma는 13/20 보통 굵기인데 글자 토큰에 없어 caption(12/20)으로 쓴다 */}
            <Text style={[typography.caption, styles.sub]}>
              고른 사람끼리 똑같이 나눠요 · 1명 금액은 10원 단위로 올려요
            </Text>
          </Section>

          <Section title="항목 이름">
            <TextField
              variant="filled"
              value={form.title}
              onChangeText={(v) => onChange({ title: v })}
              maxLength={TITLE_MAX_LENGTH}
              hideCount
              editable={!readOnly}
              accessibilityLabel="항목 이름"
              returnKeyType="done"
            />
          </Section>
        </ScrollView>

        {readOnly ? null : (
          <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, spacing[20]) }]}>
            {onDelete ? (
              <Pressable
                accessibilityRole="button"
                onPress={onDelete}
                disabled={saving}
                style={({ pressed }) => [styles.delete, pressed && styles.pressed]}
              >
                <Text style={[typography.bodyMedium, styles.deleteText]}>삭제</Text>
              </Pressable>
            ) : null}
            <Button
              label={failed ? '다시 저장' : '저장'}
              onPress={onSave}
              disabled={!canSave}
              loading={saving}
              leading={
                <Icon name={failed ? 'refresh' : 'check'} size={20} color={colors.text.inverse} />
              }
            />
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={[typography.bodyBold, styles.text]}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

/** README 상태 공통 모양의 안내 상자(회색) */
function SaveFailedBox() {
  return (
    <View style={styles.failBox} accessibilityLiveRegion="polite">
      <View style={styles.failIcon}>
        <Icon name="alert" size={22} color={colors.status.danger} />
      </View>
      <View style={styles.flex}>
        <Text style={[typography.bodyBold, styles.text]}>지출을 저장하지 못했어요</Text>
        <Text style={[typography.caption, styles.sub]}>저장하지 못했어요. 다시 눌러 주세요</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[16],
    paddingBottom: spacing[24],
    gap: spacing[24],
  },
  section: { gap: spacing[12] },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  amount: { textAlign: 'right' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[10] },
  failBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[14],
    padding: spacing[20],
    borderRadius: radius.xl,
    backgroundColor: colors.surface.subtle,
    // 금액 위 간격 28 = content gap 24 + 4
    marginBottom: spacing[4],
  },
  failIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottom: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing[10],
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[12],
  },
  delete: { paddingHorizontal: spacing[16], paddingVertical: spacing[12] },
  deleteText: { color: colors.status.danger },
  pressed: { opacity: 0.6 },
  text: { color: colors.text.default },
  sub: { color: colors.text.icon },
});
