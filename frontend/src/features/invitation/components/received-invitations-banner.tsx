import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { useReceivedInvitations } from '../hooks/use-received-invitations';
import { receivedInvitationHref } from '../received-invitation-rules';

/** 여행 탭 위 "받은 여행 초대 n개" 띠. 받은 초대가 있을 때만 보이고 누르면 받은 초대 목록으로 간다 */
export function ReceivedInvitationsBanner() {
  const { data, refetch } = useReceivedInvitations();

  // 탭에 돌아올 때마다 새로 받는다. 알림으로 초대가 막 왔을 수 있다
  useFocusEffect(
    useCallback(() => {
      void refetch({ cancelRefetch: false });
    }, [refetch]),
  );

  const count = data?.length ?? 0;
  if (count === 0) return null;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`받은 여행 초대 ${count}개`}
      onPress={() =>
        router.push(count === 1 && data ? receivedInvitationHref(data[0].id) : '/trip-invitations')
      }
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
    >
      <View style={styles.banner}>
        <Icon name="trip" size={18} color={colors.brand.primary} />
        <Text style={[typography.bodyBold, styles.text]}>받은 여행 초대 {count}개</Text>
        <Icon name="chevron-right" size={18} color={colors.brand.primary} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: layout.screenPaddingX, paddingTop: spacing[8] },
  pressed: { opacity: 0.6 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    paddingHorizontal: spacing[16],
    paddingVertical: spacing[12],
    borderRadius: radius.lg,
    backgroundColor: colors.brand.primaryBg,
  },
  text: { flex: 1, color: colors.brand.primary },
});
