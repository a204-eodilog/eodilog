import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, typography } from '@/theme';

/** 안 읽은 메시지 수 알약. 빨간 바탕에 흰 숫자(대화방 목록 줄, 지금 여행 카드) */
export function UnreadBadge({ label }: { label: string }) {
  return (
    <View style={styles.badge}>
      <Text style={[typography.micro, styles.text]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    // 흰 글자와의 대비가 충분한 빨강(5.9:1)
    backgroundColor: colors.status.danger,
  },
  text: { color: colors.text.inverse },
});
