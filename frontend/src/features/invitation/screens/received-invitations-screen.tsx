import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, EmptyState, ErrorState, Header, Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Spinner } from '@/components/ui/spinner';
import { colors, layout, radius, spacing, typography } from '@/theme';
import { SCROLL_DECELERATION } from '@/theme/scroll';

import { useReceivedInvitations } from '../hooks/use-received-invitations';
import { expiresLabel, receivedInvitationHref } from '../received-invitation-rules';

/** 받은 앱 내 여행 초대 목록. 줄을 누르면 초대 화면에서 참여·거절한다 */
export function ReceivedInvitationsScreen() {
  const list = useReceivedInvitations();

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
      <Header title="받은 여행 초대" largeTitle />
      {list.isPending ? (
        <View style={styles.center}>
          <Spinner color={colors.brand.primary} />
        </View>
      ) : list.isError ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <EmptyState icon="trip" title="받은 초대가 없어요" />
      ) : (
        <ScrollView contentContainerStyle={styles.body} decelerationRate={SCROLL_DECELERATION}>
          {list.data.map((inv) => (
            <PressableScale
              key={inv.id}
              accessibilityRole="button"
              accessibilityLabel={`${inv.inviter.nickname}님이 ${inv.trip.title}에 초대`}
              onPress={() => router.push(receivedInvitationHref(inv.id))}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <Avatar
                name={inv.inviter.nickname}
                imageUrl={inv.inviter.profileImageUrl}
                size="lg"
              />
              <View style={styles.texts}>
                <Text style={[typography.bodyBold, styles.title]} numberOfLines={1}>
                  {inv.trip.title}
                </Text>
                <Text style={[typography.caption, styles.sub]} numberOfLines={1}>
                  {inv.inviter.nickname}님의 초대 · {expiresLabel(inv.expiresAt)}
                </Text>
              </View>
              <Icon name="chevron-right" size={20} color={colors.text.icon} />
            </PressableScale>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: layout.screenPaddingX, paddingVertical: spacing[16], gap: spacing[8] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
    padding: spacing[16],
    borderRadius: radius.lg,
    backgroundColor: colors.surface.subtle,
  },
  pressed: { opacity: 0.6 },
  texts: { flex: 1, gap: spacing[2] },
  title: { color: colors.text.default },
  sub: { color: colors.text.sub },
});
