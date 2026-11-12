import { StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName, toast } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { useReadEvent } from '@/features/notification/hooks/use-read-event';
import { colors, radius, spacing, typography } from '@/theme';

import { systemCard, type SystemCardKind } from '../chat-rules';
import { SYSTEM_CARD_ROUTES } from '../system-card-routes';
import type { Message } from '../types';

const ICON: Record<SystemCardKind, IconName> = { poll: 'check', course: 'route', other: 'info' };

type Props = {
  message: Message;
  tripId: string;
};

/**
 * S47 시스템 메시지 카드(피그마 201-25281 모음, 201-11701 투표, 201-14141 코스).
 * 가운데 연파랑 카드에 아이콘·제목·설명·이동 버튼. 대상 화면이 아직 없으면 '준비 중이에요'(FR-029)
 */
export function SystemCard({ message, tripId }: Props) {
  const card = systemCard(message);
  const readEvent = useReadEvent();
  const go = () => {
    const route = SYSTEM_CARD_ROUTES[card.kind];
    if (route && message.target) {
      // 카드로 소식을 열었으니 같은 소식의 알림도 읽음으로 맞춘다. 이미 읽은 소식은 다시 보내지 않는다
      if (message.eventId && message.eventReadAt === null) readEvent(message.eventId);
      route(message.target, tripId);
    } else toast.show('준비 중이에요');
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <Icon name={ICON[card.kind]} size={18} color={colors.brand.primary} />
        </View>
        <Text style={[typography.bodyBold, styles.title]}>{card.title}</Text>
        {card.body ? <Text style={[typography.caption, styles.body]}>{card.body}</Text> : null}
        {card.action ? (
          <PressableScale
            accessibilityRole="button"
            onPress={go}
            // 보이는 높이는 36, 누르는 자리는 위아래 4씩 넓혀 44
            hitSlop={{ top: spacing[4], bottom: spacing[4] }}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            <Text style={[typography.bodyMedium, styles.buttonText]}>{card.action.label}</Text>
            <Icon name="chevron-right" size={16} color={colors.text.inverse} />
          </PressableScale>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  card: {
    width: 300,
    alignItems: 'center',
    gap: spacing[8],
    paddingHorizontal: spacing[18],
    paddingVertical: spacing[16],
    borderRadius: radius.xl,
    backgroundColor: colors.brand.primaryBg,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.white,
  },
  title: { color: colors.text.default, textAlign: 'center' },
  body: { color: colors.text.icon, textAlign: 'center' },
  button: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingLeft: spacing[16],
    paddingRight: spacing[12],
    marginTop: spacing[2],
    borderRadius: radius.full,
    backgroundColor: colors.brand.primary,
  },
  buttonText: { color: colors.text.inverse },
  pressed: { opacity: 0.8 },
});
