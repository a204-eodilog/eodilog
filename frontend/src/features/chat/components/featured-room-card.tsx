import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AvatarGroup, Icon } from '@/components/ui';
import { colors, layout, radius, spacing, typography } from '@/theme';

import type { FeaturedChatRoom } from '../hooks/use-chat-rooms';

type Props = {
  room: FeaturedChatRoom;
  meId: string | null;
  onPress: () => void;
};

/**
 * S46 맨 위 지금 여행 대화방(C안 "지금 여행 먼저", 2026-11-05 사용자 선택).
 * 여행 탭 맨 위 카드처럼 파랑 바탕에 "여행 중 · N일차", 여행 이름, 흰 칸에 최근 메시지, 아래에 동행 얼굴
 */
export function FeaturedRoomCard({ room, meId, onPress }: Props) {
  const people = room.room.participants.map((p) => ({
    name: p.nickname,
    imageUrl: p.profileImageUrl,
    me: p.id === meId,
  }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${room.kicker} ${room.title} 대화방, ${room.preview}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Text style={[typography.captionMedium, styles.kicker]}>{room.kicker}</Text>
      <Text style={[typography.title2, styles.title]} numberOfLines={1}>
        {room.title}
      </Text>
      <View style={styles.preview}>
        <Text style={[typography.sub, styles.previewText]} numberOfLines={1}>
          {room.preview}
        </Text>
        {room.time ? <Text style={[typography.caption, styles.time]}>{room.time}</Text> : null}
      </View>
      <View style={styles.bottom}>
        <AvatarGroup people={people} max={4} />
        <View style={styles.go}>
          <Text style={[typography.captionBold, styles.goText]}>대화 이어가기</Text>
          <Icon name="chevron-right" size={16} color={colors.text.inverse} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: layout.screenPaddingX,
    padding: spacing[16],
    gap: spacing[4],
    borderRadius: radius.xl,
    backgroundColor: colors.brand.primary,
  },
  pressed: { opacity: 0.9 },
  kicker: { color: colors.onBrand.textSoft },
  title: { color: colors.text.inverse, marginBottom: spacing[8] },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    paddingHorizontal: spacing[12],
    paddingVertical: spacing[10],
    borderRadius: radius.md,
    backgroundColor: colors.surface.white,
  },
  previewText: { flex: 1, color: colors.text.default },
  time: { color: colors.text.sub },
  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing[10],
  },
  go: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  goText: { color: colors.text.inverse },
});
