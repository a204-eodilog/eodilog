import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

import type { OutboxItem } from '../types';

type Props = {
  item: OutboxItem;
  onRetry: (clientMessageId: string) => void;
  onDiscard: (clientMessageId: string) => void;
};

/**
 * 보내는 중·못 보낸 내 메시지(피그마 S47 201-25163, 201-25171). 말풍선은 흐리게(0.56) 둔다.
 * 못 보냈으면 [다시 보내기]와 지우기 아이콘. 거절된 메시지(rejected)는 다시 보내도 같아서 지우기만 둔다
 */
export function OutboxBubble({ item, onRetry, onDiscard }: Props) {
  const failed = item.status === 'failed';
  return (
    <View style={styles.row}>
      {failed ? (
        <View style={styles.side}>
          <View style={styles.label}>
            <Icon name="alert" size={14} color={colors.status.danger} />
            <Text style={[typography.captionMedium, styles.failedText]}>못 보냈어요</Text>
          </View>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="이 메시지 지우기"
              onPress={() => onDiscard(item.clientMessageId)}
              hitSlop={spacing[8]}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <Icon name="trash" size={14} color={colors.text.sub} />
            </Pressable>
            {item.failure === 'retry' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="다시 보내기"
                onPress={() => onRetry(item.clientMessageId)}
                style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
              >
                <Icon name="refresh" size={14} color={colors.status.danger} />
                <Text style={[typography.captionMedium, styles.failedText]}>다시 보내기</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : (
        <View
          style={styles.label}
          accessibilityLabel={item.waiting ? '연결되면 보내요' : '보내는 중'}
        >
          <Icon name="clock" size={14} color={colors.text.sub} />
          {/* 연결이 끊겨 기다리는 중이면 연결되는 대로 자동으로 보낸다(카카오톡처럼) */}
          <Text style={[typography.caption, styles.sendingText]}>
            {item.waiting ? '연결되면 보내요' : '보내는 중'}
          </Text>
        </View>
      )}
      <View style={styles.bubble}>
        <Text style={[typography.body, styles.text]}>{item.text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'flex-end', gap: 8 },
  side: { alignItems: 'flex-end', gap: spacing[2] },
  label: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  iconButton: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.default,
  },
  retry: {
    height: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingLeft: spacing[8],
    paddingRight: spacing[10],
    borderRadius: radius.full,
    backgroundColor: colors.status.dangerBg,
  },
  pressed: { opacity: 0.6 },
  failedText: { color: colors.status.danger },
  sendingText: { color: colors.text.sub },
  bubble: {
    maxWidth: 262,
    flexShrink: 1,
    paddingHorizontal: spacing[16],
    paddingVertical: spacing[10],
    backgroundColor: colors.brand.primary,
    opacity: 0.56,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 4,
  },
  text: { color: colors.text.inverse },
});
