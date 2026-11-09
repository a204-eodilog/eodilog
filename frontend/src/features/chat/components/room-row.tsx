import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { UserCard } from '@/api/types';
import { AvatarGroup } from '@/components/ui';
import { colors, layout, spacing, typography } from '@/theme';

type Props = {
  title: string;
  preview: string;
  time: string | null;
  /** 지금 동행. 왼쪽에 얼굴을 겹쳐 보인다 */
  participants: UserCard[];
  meId: string | null;
  onPress: () => void;
};

/** 얼굴 묶음 자리. 줄마다 같은 너비라 이름 시작이 가지런하다 */
export const ROOM_FACES_WIDTH = 64;

/**
 * S46 대화방 한 줄(C안). 같은 아이콘을 늘어놓는 대신 동행 얼굴을 겹쳐 보여 어느 방인지 알아보기 쉽게 한다.
 * 여행 이름, 최근 메시지, 시각. 미확인 수는 넣지 않는다(Clarifications)
 */
export function RoomRow({ title, preview, time, participants, meId, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title} 대화방, ${preview}${time ? `, ${time}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.faces}>
        <AvatarGroup
          people={participants.map((p) => ({
            name: p.nickname,
            imageUrl: p.profileImageUrl,
            me: p.id === meId,
          }))}
          max={2}
        />
      </View>
      <View style={styles.texts}>
        <Text style={[typography.bodyBold, styles.title]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[typography.caption, styles.preview]} numberOfLines={1}>
          {preview}
        </Text>
      </View>
      {time ? <Text style={[typography.caption, styles.time]}>{time}</Text> : null}
    </Pressable>
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
  faces: { width: ROOM_FACES_WIDTH },
  texts: { flex: 1, gap: spacing[2] },
  title: { color: colors.text.default },
  preview: { color: colors.text.icon },
  time: { alignSelf: 'flex-start', marginTop: spacing[14], color: colors.text.sub },
});
