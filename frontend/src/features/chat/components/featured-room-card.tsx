import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, layout, radius, spacing, typography } from '@/theme';

import type { FeaturedChatRoom } from '../hooks/use-chat-rooms';
import { roomA11yLabel } from '../room-faces-rules';

import { MemberCount, RoomFaces } from './room-faces';

type Props = {
  room: FeaturedChatRoom;
  meId: string | null;
  onPress: () => void;
};

/**
 * S46 맨 위 지금 여행 대화방(C안 "지금 여행 먼저", 2026-11-05 사용자 선택).
 * 카드 위에 [핀] "여행 중 · N일차"(다가오는 여행이면 D-day). 옅은 파랑 카드 안에
 * 첫 줄: 방 이름 + 전체 인원 … 얼굴 묶음 / 둘째 줄: 최근 메시지 흰 말풍선 … 시각 ›. 카드 전체를 누르면 방으로 간다
 */
export function FeaturedRoomCard({ room, meId, onPress }: Props) {
  const count = room.room.participants.length;
  return (
    <View style={styles.wrap}>
      <View style={styles.kickerRow}>
        <Icon name="map-pin" size={14} color={colors.brand.primary} />
        <Text style={[typography.captionMedium, styles.kicker]}>{room.kicker}</Text>
      </View>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={roomA11yLabel({
          title: `${room.title} 대화방`,
          count,
          kicker: room.kicker,
          preview: room.preview,
          time: room.time,
        })}
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      >
        <View style={styles.top}>
          <View style={styles.titleRow}>
            <Text style={[typography.title3, styles.title]} numberOfLines={1}>
              {room.title}
            </Text>
            <MemberCount count={count} />
          </View>
          <RoomFaces
            participants={room.room.participants}
            meId={meId}
            ringColor={colors.brand.primaryTint}
          />
        </View>
        <View style={styles.bottom}>
          {/* 짧으면 글 길이만큼만 감싸고, 길면 시각·꺾쇠 자리를 남기고 한 줄로 줄인다 */}
          <View style={styles.bubble}>
            <Text style={[typography.sub, styles.bubbleText]} numberOfLines={1}>
              {room.preview}
            </Text>
          </View>
          <View style={styles.meta}>
            {room.time ? <Text style={[typography.caption, styles.time]}>{room.time}</Text> : null}
            <Icon name="chevron-right" size={16} color={colors.text.muted} />
          </View>
        </View>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: layout.screenPaddingX, gap: spacing[8] },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  kicker: { color: colors.text.icon },
  card: {
    padding: spacing[16],
    gap: spacing[10],
    borderRadius: radius.xl,
    backgroundColor: colors.brand.primaryTint,
  },
  pressed: { opacity: 0.85 },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing[12] },
  // 이름이 길면 이름만 줄고 인원수는 남는다
  titleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  title: { flexShrink: 1, color: colors.text.default },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
  // 흰 말풍선. 왼쪽 위 모서리를 덜 둥글게 해 말풍선처럼 보인다
  bubble: {
    flexShrink: 1,
    paddingHorizontal: spacing[12],
    paddingVertical: spacing[8],
    borderRadius: radius.lg,
    borderTopLeftRadius: radius.xs,
    backgroundColor: colors.surface.white,
  },
  bubbleText: { color: colors.text.default },
  meta: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flexShrink: 0,
  },
  time: { color: colors.text.sub },
});
