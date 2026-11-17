import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  Avatar,
  BottomSheet,
  Button,
  EmptyState,
  Icon,
  RoundCheck,
  TextField,
} from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Spinner } from '@/components/ui/spinner';
import type { InvitableFriend } from '@/features/invitation/types';
import { colors, radius, spacing, typography } from '@/theme';
import { SCROLL_DECELERATION } from '@/theme/scroll';

import { filterFriends, isPickable, remainingSeats, togglePick } from '../friend-invite-rules';
import { useFriendInviteActions, useInvitableFriends } from '../hooks/use-invitable-friends';

type Props = {
  visible: boolean;
  onClose: () => void;
  tripId: string;
};

const STATE_LABEL: Record<InvitableFriend['state'], string | null> = {
  INVITABLE: null,
  INVITED: '초대함',
  MEMBER: '참여 중',
};

/**
 * S18 친구 초대 시트. 서로 팔로우한 친구를 여러 명 골라 앱 안에서 초대를 보낸다.
 * 이미 초대했거나 함께하는 친구는 고를 수 없다. 남은 자리보다 많이 고를 수 없다
 */
export function FriendInviteSheet({ visible, onClose, tripId }: Props) {
  const friends = useInvitableFriends(tripId);
  const { send } = useFriendInviteActions(tripId);
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState('');

  // 다시 열 때마다 아무도 고르지 않은 상태에서 시작하고 목록을 새로 받는다
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setPicked([]);
      setQuery('');
      void friends.refetch();
    }
  }

  const data = friends.data;
  const seats = data ? remainingSeats(data.capacity, data.activeMemberCount) : 0;
  const shown = useMemo(() => filterFriends(data?.friends ?? [], query), [data, query]);
  const busy = send.isPending;

  const toggle = (friend: InvitableFriend) => {
    if (!isPickable(friend) || busy) return;
    setPicked((now) => togglePick(now, friend.user.id, seats));
  };

  const submit = () => {
    send.mutate(picked, { onSuccess: () => onClose() });
  };

  const empty = data && data.friends.length === 0;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      locked={busy}
      scrollable
      title="친구 초대"
      titleVariant="title2"
      footer={
        empty ? null : (
          <Button
            label={picked.length > 0 ? `${picked.length}명 초대하기` : '친구를 골라 주세요'}
            size="lg"
            block
            disabled={picked.length === 0}
            loading={busy}
            onPress={submit}
          />
        )
      }
    >
      <View style={styles.description}>
        <Icon name="info" size={16} color={colors.text.icon} />
        <Text style={[typography.caption, styles.sub]}>
          서로 팔로우한 친구만 보여요{data ? ` · 남은 자리 ${seats}명` : ''}
        </Text>
      </View>

      {friends.isPending ? (
        <View style={styles.center}>
          <Spinner color={colors.brand.primary} />
        </View>
      ) : friends.isError ? (
        <View style={styles.center}>
          <Text style={[typography.body, styles.sub]}>친구 목록을 불러오지 못했어요</Text>
          <Button
            label="다시 시도"
            icon="refresh"
            variant="neutral"
            onPress={() => friends.refetch()}
          />
        </View>
      ) : empty ? (
        <EmptyState
          icon="people"
          title="서로 팔로우한 친구가 없어요"
          description="친구를 팔로우하고 맞팔이 되면 앱에서 바로 초대할 수 있어요"
          actionLabel="친구 찾기"
          actionIcon="search"
          onAction={() => {
            onClose();
            router.push('/find-friends');
          }}
        />
      ) : (
        <>
          <TextField
            value={query}
            onChangeText={setQuery}
            placeholder="닉네임 검색"
            accessibilityLabel="닉네임 검색"
            returnKeyType="search"
          />
          <ScrollView style={styles.list} decelerationRate={SCROLL_DECELERATION}>
            {shown.map((friend) => {
              const selected = picked.includes(friend.user.id);
              const pickable = isPickable(friend);
              const full = !selected && picked.length >= seats;
              const label = STATE_LABEL[friend.state];
              return (
                <PressableScale
                  key={friend.user.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected, disabled: !pickable || busy }}
                  accessibilityLabel={friend.user.nickname}
                  disabled={!pickable || busy}
                  onPress={() => toggle(friend)}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && styles.pressed,
                    (!pickable || full) && styles.dim,
                  ]}
                >
                  {pickable ? (
                    <RoundCheck
                      checked={selected}
                      onChange={() => toggle(friend)}
                      disabled={busy}
                      accessibilityLabel={friend.user.nickname}
                    />
                  ) : (
                    <View style={styles.checkSpace} />
                  )}
                  <Avatar
                    name={friend.user.nickname}
                    imageUrl={friend.user.profileImageUrl}
                    size="lg"
                  />
                  <Text style={[typography.bodyBold, styles.name]} numberOfLines={1}>
                    {friend.user.nickname}
                  </Text>
                  {label ? <Text style={[typography.caption, styles.sub]}>{label}</Text> : null}
                </PressableScale>
              );
            })}
            {shown.length === 0 ? (
              <Text style={[typography.caption, styles.sub, styles.noMatch]}>
                맞는 친구가 없어요
              </Text>
            ) : null}
            {data?.truncated ? (
              <Text style={[typography.caption, styles.sub, styles.noMatch]}>
                친구가 많아 일부만 보여요. 검색해 보세요
              </Text>
            ) : null}
          </ScrollView>
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  description: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    marginTop: -spacing[6],
    marginBottom: spacing[12],
  },
  center: { alignItems: 'center', gap: spacing[12], paddingVertical: spacing[24] },
  list: {
    maxHeight: 320,
    marginTop: spacing[12],
    borderRadius: radius.lg,
    backgroundColor: colors.surface.subtle,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
    minHeight: 60,
    paddingHorizontal: spacing[16],
  },
  checkSpace: { width: 24 },
  pressed: { opacity: 0.6 },
  dim: { opacity: 0.45 },
  name: { flex: 1, color: colors.text.default },
  sub: { color: colors.text.sub },
  noMatch: { textAlign: 'center', paddingVertical: spacing[16] },
});
