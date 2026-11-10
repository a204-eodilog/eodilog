import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui';
import { colors, spacing, typography } from '@/theme';

type Props = {
  text: string | null;
  mine: boolean;
  /** 같은 사람이 이어 보낸 줄이면 false. 얼굴·이름 자리만 비워 둔다 */
  showSender: boolean;
  senderName: string | null;
  senderImageUrl: string | null;
  time: string;
  /** 보낸 사람이 "내 채팅 삭제"로 지운 메시지 */
  deleted: boolean;
};

/** 얼굴 32 + 간격 10. 이어 보낸 줄은 이만큼 들여 쓴다 */
const AVATAR = 32;
const AVATAR_GAP = 10;

/**
 * S47 사람 메시지(피그마 201-25111 남의 것, 201-25158 내 것).
 * 남의 것은 왼쪽에 얼굴·이름, 회색 말풍선(왼쪽 위만 4). 내 것은 오른쪽 파랑 말풍선(오른쪽 아래만 4).
 * 시각은 말풍선 바깥 아래에 둔다
 */
export function MessageBubble({
  text,
  mine,
  showSender,
  senderName,
  senderImageUrl,
  time,
  deleted,
}: Props) {
  const body = deleted ? '삭제된 메시지예요' : (text ?? '');
  const timeText = <Text style={[typography.caption, styles.time]}>{time}</Text>;

  if (mine) {
    return (
      <View style={[styles.row, styles.rowMine]}>
        {timeText}
        <View style={[styles.bubble, styles.bubbleMine, deleted && styles.bubbleDeleted]}>
          <Text style={[typography.body, deleted ? styles.textDeleted : styles.textMine]}>
            {body}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      {showSender ? (
        <Avatar name={senderName ?? '?'} imageUrl={senderImageUrl} size={AVATAR} />
      ) : (
        <View style={styles.avatarSpace} />
      )}
      <View style={styles.column}>
        {showSender && senderName ? (
          <Text style={[typography.caption, styles.name]}>{senderName}</Text>
        ) : null}
        <View style={styles.bubbleRow}>
          <View style={[styles.bubble, styles.bubbleOther]}>
            <Text style={[typography.body, deleted ? styles.textDeleted : styles.textOther]}>
              {body}
            </Text>
          </View>
          {timeText}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: AVATAR_GAP },
  rowMine: { justifyContent: 'flex-end', alignItems: 'flex-end', gap: spacing[8] },
  avatarSpace: { width: AVATAR },
  column: { flexShrink: 1, gap: spacing[8] },
  name: { color: colors.text.icon },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing[8] },
  bubble: { paddingVertical: spacing[10], flexShrink: 1 },
  bubbleOther: {
    maxWidth: 258,
    paddingHorizontal: spacing[14],
    backgroundColor: colors.surface.default,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  bubbleMine: {
    maxWidth: 262,
    paddingHorizontal: spacing[16],
    backgroundColor: colors.brand.primary,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 4,
  },
  bubbleDeleted: { backgroundColor: colors.surface.default },
  textOther: { color: colors.text.default },
  textMine: { color: colors.text.inverse },
  textDeleted: { color: colors.text.muted },
  time: { color: colors.text.sub },
});
