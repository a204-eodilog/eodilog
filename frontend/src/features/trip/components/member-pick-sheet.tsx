import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BottomSheet, Button, Icon, RoundCheck } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { seoulToday } from '@/lib/seoul-date';
import { colors, radius, spacing, typography } from '@/theme';

import type { TripMember } from '../types';

export type MemberPickMode = 'handover' | 'kick';

type Props = {
  visible: boolean;
  onClose: () => void;
  mode: MemberPickMode;
  /** pickableMembers 결과. 나를 뺀 동행, 참여 순서 */
  members: TripMember[];
  /** 고른 사람으로 버튼을 누르면 부른다 */
  onPick: (member: TripMember) => void;
  loading?: boolean;
};

const COPY: Record<MemberPickMode, { title: string; description: string; button: string }> = {
  handover: {
    title: '방장을 누구에게 넘길까요?',
    description: '넘기면 내보내기·삭제는 새 방장만 할 수 있어요',
    button: '님에게 넘기기',
  },
  kick: {
    title: '누구를 내보낼까요?',
    description: '내보낸 동행은 이 여행을 더 볼 수 없어요. 경비 기록은 남아요',
    button: '님 내보내기',
  },
};

/** "2026-11-03T…Z" → 서울 날짜 "11.03" */
function joinedDay(joinedAt: string): string {
  return seoulToday(new Date(joinedAt)).slice(5).replace('-', '.');
}

/**
 * S19 방장 넘기기 대상 선택(피그마 S19) · 내보낼 동행 고르기. 같은 모양에 문구만 다르다(research R7).
 * 넘기기는 버튼에 받을 사람 이름이 있어 확인창을 따로 두지 않는다(FR-018). 내보내기는 부르는 쪽이 한 번 더 묻는다
 */
export function MemberPickSheet({ visible, onClose, mode, members, onPick, loading }: Props) {
  const [pickedId, setPickedId] = useState<string | null>(null);

  // 다시 열 때마다 아무도 고르지 않은 상태에서 시작한다
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setPickedId(null);
  }

  const picked = members.find((m) => m.id === pickedId) ?? null;
  const copy = COPY[mode];

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      locked={loading}
      // 피그마 S19 방장 넘기기 대상 선택: 제목 20, 설명 12와 아이콘 16, 버튼 높이 48
      title={copy.title}
      titleVariant="title2"
      footer={
        <Button
          label={picked ? `${picked.user.nickname}${copy.button}` : '동행을 골라 주세요'}
          size="lg"
          block
          variant={mode === 'kick' ? 'danger' : 'primary'}
          disabled={!picked}
          loading={loading}
          onPress={() => picked && onPick(picked)}
        />
      }
    >
      <View style={styles.description}>
        <Icon name="info" size={16} color={colors.text.icon} />
        <Text style={[typography.caption, styles.sub]}>{copy.description}</Text>
      </View>
      <View style={styles.list} accessibilityRole="radiogroup">
        {members.map((m, i) => {
          const selected = m.id === pickedId;
          return (
            <PressableScale
              key={m.id}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: loading }}
              disabled={loading}
              onPress={() => setPickedId(m.id)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <RoundCheck
                checked={selected}
                onChange={() => setPickedId(m.id)}
                disabled={loading}
                accessibilityLabel={m.user.nickname}
              />
              <View style={styles.texts}>
                <Text style={[typography.bodyBold, styles.name]}>{m.user.nickname}</Text>
                <Text style={[typography.caption, styles.sub]}>
                  {joinedDay(m.joinedAt)} 참여{i === 0 ? ' · 가장 먼저 참여' : ''}
                </Text>
              </View>
            </PressableScale>
          );
        })}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  description: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    marginTop: -spacing[6],
    marginBottom: spacing[16],
  },
  list: {
    gap: spacing[4],
    padding: spacing[12],
    borderRadius: radius.lg,
    backgroundColor: colors.surface.subtle,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
    minHeight: 60,
    paddingHorizontal: spacing[8],
  },
  pressed: { opacity: 0.6 },
  texts: { flex: 1 },
  name: { color: colors.text.default },
  sub: { color: colors.text.sub },
});
