import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FadeIn } from '@/components/ui/fade-in';
import { Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Popup } from '@/components/ui/popup';
import { colors, radius, spacing, typography } from '@/theme';

import type { NotificationLine } from '../notification-rules';

import { NotificationRow } from './notification-row';

type Choice = { label: string; onPress: () => void };

/** 팝업 아래 버튼 둘. 왼쪽 회색 글자, 오른쪽 파란 알약(Figma 201-12243) */
function Choices({ left, right }: { left: Choice; right: Choice }) {
  return (
    <View style={styles.choices}>
      <PressableScale
        onPress={left.onPress}
        accessibilityRole="button"
        style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
      >
        <Text style={[typography.bodyMedium, styles.leftText]}>{left.label}</Text>
      </PressableScale>
      <PressableScale
        onPress={right.onPress}
        accessibilityRole="button"
        style={({ pressed }) => [styles.choice, styles.primary, pressed && styles.pressed]}
      >
        <Text style={[typography.bodyMedium, styles.primaryText]}>{right.label}</Text>
      </PressableScale>
    </View>
  );
}

/** 어두운 바탕 위 가운데 흰 카드. 바탕을 누르거나 뒤로 가기를 누르면 닫는다 */
function Dialog({
  visible,
  onDismiss,
  wide,
  children,
}: {
  visible: boolean;
  onDismiss: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <Popup
      visible={visible}
      onRequestClose={onDismiss}
      cardStyle={[styles.card, wide ? styles.wide : styles.narrow]}
      accessibilityViewIsModal
      // 카드 밖을 누르면 닫힌다
      onBackdropPress={onDismiss}
      backdropLabel="알림 닫기"
    >
      {children}
    </Popup>
  );
}

export type ManyPopupProps = {
  visible: boolean;
  /** 안 읽은 행동 알림 수. 줄은 앞의 셋만 보인다 */
  count: number;
  lines: NotificationLine[];
  onLine: (line: NotificationLine) => void;
  onClose: () => void;
  onAll: () => void;
};

const MAX_LINES = 3;

/** S48 미확인 알림 모아 보기 201-25425 */
export function ManyPopup({ visible, count, lines, onLine, onClose, onAll }: ManyPopupProps) {
  return (
    <Dialog visible={visible} onDismiss={onClose} wide>
      <Text style={[typography.title1, styles.manyTitle]} accessibilityRole="header">
        새 알림 {count}개
      </Text>
      <View style={styles.lines}>
        {lines.slice(0, MAX_LINES).map((line, order) => (
          <FadeIn key={line.id} index={order}>
            <NotificationRow line={line} compact onPress={() => onLine(line)} />
          </FadeIn>
        ))}
      </View>
      <Choices
        left={{ label: '닫기', onPress: onClose }}
        right={{ label: '알림 모두 보기', onPress: onAll }}
      />
    </Dialog>
  );
}

export type PollPopupProps = {
  visible: boolean;
  title: string;
  message: string;
  /** "10.28(수) 21:00 마감". 투표 정보를 못 받으면 없다 */
  deadline: string | null;
  onLater: () => void;
  onGo: () => void;
};

/** S48 투표 시작 201-11808 */
export function PollPopup({ visible, title, message, deadline, onLater, onGo }: PollPopupProps) {
  return (
    <Dialog visible={visible} onDismiss={onLater}>
      <View style={styles.pollIcon}>
        <Icon name="check" size={26} color={colors.text.default} />
      </View>
      <Text style={[typography.title1, styles.center]} accessibilityRole="header">
        {title}
      </Text>
      <Text style={[typography.body, styles.message]}>{message}</Text>
      {deadline ? (
        <View style={styles.deadline}>
          <Icon name="clock" size={16} color={colors.brand.primaryDark} />
          <Text style={[typography.caption, styles.deadlineText]}>{deadline}</Text>
        </View>
      ) : null}
      <Choices
        left={{ label: '나중에', onPress: onLater }}
        right={{ label: '투표하러 가기', onPress: onGo }}
      />
    </Dialog>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.surface.white,
    borderRadius: radius.xl,
    paddingTop: spacing[24],
    paddingBottom: 22,
    gap: spacing[12],
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 8,
  },
  // Figma 투표 시작 카드 310(좌우 40), 모아 보기 카드 330(좌우 30)
  narrow: { width: '79.5%', maxWidth: 310, paddingHorizontal: spacing[24], alignItems: 'center' },
  wide: { width: '84.6%', maxWidth: 330, paddingHorizontal: 22 },
  manyTitle: { color: colors.text.default },
  lines: { gap: spacing[16], marginTop: spacing[8] },
  pollIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.brand.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[8],
  },
  center: { color: colors.text.default, textAlign: 'center' },
  message: { color: colors.text.icon, textAlign: 'center' },
  deadline: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  deadlineText: { color: colors.brand.primaryDark },
  choices: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: spacing[16],
    alignSelf: 'stretch',
  },
  choice: {
    flex: 1,
    height: 48,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[12],
  },
  primary: { backgroundColor: colors.brand.primary },
  leftText: { color: colors.text.icon },
  primaryText: { color: colors.text.inverse },
  pressed: { opacity: 0.7 },
});
