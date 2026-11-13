import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Header, Icon } from '@/components/ui';
import type { TripMember } from '@/features/expense';
import { colors, layout, radius, spacing, typography } from '@/theme';

import type { DraftItem, DraftProblem } from '../voice-rules';

import { VoiceDraftCard } from './voice-draft-card';

export type VoiceDraftsViewProps = {
  tripTitle: string;
  transcript: string;
  /** 말한 지출과 초안 수가 다를 수 있다(COUNT_MISMATCH) */
  countMismatch: boolean;
  items: DraftItem[];
  members: TripMember[];
  myMemberId: string | null;
  problemsOf: (item: DraftItem) => DraftProblem[];
  save: { count: number; blocked: number; canSave: boolean };
  saving: boolean;
  saveFailed: boolean;
  onToggle: (draftId: string) => void;
  onEdit: (draftId: string) => void;
  onRerecord: () => void;
  onSave: () => void;
  onClose: () => void;
};

/**
 * N11 말로 경비 초안 확인. 상태: 기본 / 확인 필요 있음 / 사람 확인 / 건수 다름 / 고른 초안 없음 /
 * 저장 중 / 저장 실패(Figma "10-1. 여행 후 · 말로 경비 입력"). 결과 만료·닫기 확인·초안 고치기는 화면에서 그린다
 */
export function VoiceDraftsView({
  tripTitle,
  transcript,
  countMismatch,
  items,
  members,
  myMemberId,
  problemsOf,
  save,
  saving,
  saveFailed,
  onToggle,
  onEdit,
  onRerecord,
  onSave,
  onClose,
}: VoiceDraftsViewProps) {
  const insets = useSafeAreaInsets();
  const right =
    save.blocked > 0
      ? `확인 필요 ${save.blocked}건`
      : save.count === 0
        ? '0건 선택'
        : '눌러서 고치기';

  return (
    <View style={styles.screen}>
      <Header
        close
        title="말로 입력한 지출"
        subtitle={tripTitle}
        subtitleIcon="trip"
        onBack={onClose}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {saveFailed ? (
          <Box
            tone="neutral"
            title="지출을 저장하지 못했어요"
            description="고친 내용은 그대로예요. 다시 눌러 주세요"
          />
        ) : null}
        {countMismatch ? (
          <Box
            tone="warning"
            title="말한 지출과 초안 수가 다를 수 있어요"
            description="빠진 지출이 있으면 직접 추가해 주세요"
          />
        ) : null}

        <View style={styles.transcript}>
          <View style={styles.transcriptHead}>
            <Icon name="mic" size={16} color={colors.text.icon} />
            <Text style={[typography.captionMedium, styles.sub]}>받아 적은 글</Text>
          </View>
          <Text style={[typography.body, styles.text]}>{transcript}</Text>
        </View>

        <View style={styles.titleRow}>
          <Text style={[typography.title3, styles.text]}>초안 {items.length}건</Text>
          <Text style={[typography.caption, save.blocked > 0 ? styles.danger : styles.sub]}>
            {right}
          </Text>
        </View>

        {items.map((item) => (
          <VoiceDraftCard
            key={item.draftId}
            item={item}
            members={members}
            myMemberId={myMemberId}
            problems={problemsOf(item)}
            onToggle={() => onToggle(item.draftId)}
            onPress={() => onEdit(item.draftId)}
            disabled={saving}
          />
        ))}

        {save.count === 0 ? (
          <Text style={[typography.caption, styles.sub]}>저장할 초안을 하나 이상 골라 주세요</Text>
        ) : save.blocked > 0 ? (
          <Text style={[typography.caption, styles.sub]}>
            확인이 필요한 곳을 고치면 저장할 수 있어요
          </Text>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.bottom,
          { paddingBottom: Math.max(insets.bottom + spacing[16], spacing[20]) },
        ]}
      >
        <Button
          label="다시 녹음"
          variant="neutral"
          onPress={onRerecord}
          disabled={saving}
          leading={<Icon name="mic" size={20} color={colors.text.icon} />}
        />
        <Button
          label={saveFailed ? '다시 저장' : `${save.count}건 저장`}
          onPress={onSave}
          disabled={!save.canSave}
          loading={saving}
          leading={
            <Icon name={saveFailed ? 'refresh' : 'check'} size={20} color={colors.text.inverse} />
          }
        />
      </View>
    </View>
  );
}

function Box({
  tone,
  title,
  description,
}: {
  tone: 'neutral' | 'warning';
  title: string;
  description: string;
}) {
  const warn = tone === 'warning';
  return (
    <View
      style={[styles.box, warn ? styles.boxWarn : styles.boxNeutral]}
      accessibilityLiveRegion="polite"
    >
      <Icon name="alert" size={22} color={warn ? colors.status.warning : colors.text.icon} />
      <View style={styles.flex}>
        <Text style={[typography.bodyBold, styles.text]}>{title}</Text>
        <Text style={[typography.caption, styles.sub]}>{description}</Text>
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
    gap: spacing[16],
  },
  transcript: {
    gap: spacing[6],
    paddingHorizontal: spacing[16],
    paddingVertical: spacing[14],
    borderRadius: radius.lg,
    backgroundColor: colors.surface.default,
  },
  transcriptHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing[4],
  },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
    padding: spacing[16],
    borderRadius: radius.lg,
  },
  boxNeutral: { backgroundColor: colors.surface.subtle },
  boxWarn: { backgroundColor: colors.status.warningBg2 },
  bottom: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing[10],
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[12],
  },
  text: { color: colors.text.default },
  sub: { color: colors.text.icon },
  danger: { color: colors.status.danger },
});
