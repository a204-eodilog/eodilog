import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Icon } from '@/components/ui';
import { colors, layout, radius, spacing, typography } from '@/theme';

type Props = {
  /** 내 닉네임(얼굴 첫 글자) */
  myName: string;
  /** "부산에 투표했어요"·"2곳 투표했어요". 고른 것이 없으면 null */
  summary: string | null;
  /** 투표 중에 새 후보가 들어왔다. 노란 줄로 바꿔 다시 고르게 알린다(Figma 385-2305) */
  highlight?: boolean;
  onCancel: () => void;
  onChange: () => void;
};

/**
 * S22 하단 내 선택 요약(Figma 201-11042). 요약 문구, 취소(닫기 아이콘), [바꾸기].
 * 누르면 바로 저장되므로 [바꾸기]는 후보 목록 맨 위로 가게 한다 (가정 — 사용자 확인 필요, Q-4-3)
 */
export function MyVoteBar({ myName, summary, highlight = false, onCancel, onChange }: Props) {
  if (!summary) {
    return (
      <View style={styles.row}>
        <Text style={styles.hint}>후보를 눌러 투표해요</Text>
      </View>
    );
  }
  return (
    <View style={[styles.row, highlight && styles.highlight]}>
      <Avatar name={myName} size="sm" me />
      <Text style={styles.summary} numberOfLines={1}>
        {summary}
      </Text>
      {highlight ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="내 투표 취소"
          onPress={onCancel}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <Icon name="close" size={20} color={colors.text.icon} />
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="투표 바꾸기"
        onPress={onChange}
        style={({ pressed }) => [styles.changeButton, pressed && styles.pressed]}
      >
        <Icon name="refresh" size={16} color={colors.text.default} />
        <Text style={styles.change}>바꾸기</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // 피그마: 얼굴 24, 사이 10, 버튼 높이 36
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: layout.minTouchTarget },
  // 피그마 385-2305: 연한 노랑 면, 둥글기 16, 안쪽 좌우 16
  highlight: {
    backgroundColor: colors.status.warningBg2,
    borderRadius: radius.lg,
    paddingHorizontal: spacing[16],
    paddingVertical: spacing[10],
  },
  hint: { ...typography.body, color: colors.text.sub },
  summary: { ...typography.body, color: colors.text.default, flex: 1 },
  // 내 투표 취소. 닫기 아이콘만, 누르는 자리 44
  iconButton: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
    height: 36,
    paddingLeft: spacing[12],
    paddingRight: spacing[16],
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
  },
  change: { ...typography.bodyMedium, color: colors.text.default },
  pressed: { opacity: 0.6 },
});
