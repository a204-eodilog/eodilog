import { StyleSheet, Text, View } from 'react-native';

import type { UserCard } from '@/api/types';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, layout, spacing, typography } from '@/theme';

import { roomA11yLabel } from '../room-faces-rules';

import { MemberCount, RoomFaces } from './room-faces';

type Props = {
  title: string;
  preview: string;
  time: string | null;
  /** 지금 동행. 왼쪽에 얼굴 묶음, 이름 옆에 전체 인원 */
  participants: UserCard[];
  meId: string | null;
  onPress: () => void;
};

/**
 * S46 대화방 한 줄(C안). 흰 카드 하나에 [얼굴 묶음] 방 이름 + 전체 인원 / 최근 메시지 … 시각.
 * 얼굴 묶음은 인원수와 관계없이 같은 너비라 이름 시작이 가지런하다. 미확인 수는 넣지 않는다(Clarifications)
 */
export function RoomRow({ title, preview, time, participants, meId, onPress }: Props) {
  const count = participants.length;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={roomA11yLabel({ title: `${title} 대화방`, count, preview, time })}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <RoomFaces participants={participants} meId={meId} ringColor={colors.surface.white} />
      <View style={styles.texts}>
        <View style={styles.titleRow}>
          <Text style={[typography.bodyBold, styles.title]} numberOfLines={1}>
            {title}
          </Text>
          <MemberCount count={count} />
        </View>
        <Text style={[typography.caption, styles.preview]} numberOfLines={1}>
          {preview}
        </Text>
      </View>
      {time ? <Text style={[typography.caption, styles.time]}>{time}</Text> : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[14],
    minHeight: 72,
    paddingHorizontal: layout.screenPaddingX,
  },
  pressed: { backgroundColor: colors.surface.subtle },
  texts: { flex: 1, gap: spacing[2] },
  // 이름이 길면 이름만 줄고 인원수는 남는다
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  title: { flexShrink: 1, color: colors.text.default },
  preview: { color: colors.text.icon },
  time: { alignSelf: 'flex-start', marginTop: spacing[14], flexShrink: 0, color: colors.text.sub },
});
