import { StyleSheet, Text, View } from 'react-native';

import { errorLook } from '@/api/error-look';
import { Button, Icon, type IconName } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, layout, spacing, typography } from '@/theme';

type Action = { label: string; icon: IconName; onPress: () => void };

type NoticeProps = {
  icon: IconName;
  title: string;
  /** 없으면 아이콘과 제목만 보인다. 오류 안내는 설명을 두지 않는다 */
  description?: string;
  primary?: Action;
  secondary?: Action;
};

/** S49 가운데 안내. 회색 원 아이콘, 굵은 제목, 설명, 파란 알약 버튼, 글자 버튼 */
function Notice({ icon, title, description, primary, secondary }: NoticeProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.circle}>
        <Icon name={icon} size={24} color={colors.text.icon} />
      </View>
      <Text style={[typography.title2, styles.title]}>{title}</Text>
      {description ? (
        <Text style={[typography.bodySmall, styles.description]}>{description}</Text>
      ) : null}
      {primary ? (
        <Button
          label={primary.label}
          size="md"
          weight="medium"
          leading={<Icon name={primary.icon} size={18} color={colors.text.inverse} />}
          onPress={primary.onPress}
          style={styles.primary}
        />
      ) : null}
      {secondary ? (
        <PressableScale
          onPress={secondary.onPress}
          accessibilityRole="button"
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
        >
          <Icon name={secondary.icon} size={18} color={colors.text.icon} />
          <Text style={[typography.bodyMedium, styles.secondaryText]}>{secondary.label}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

/** S49 알림 없음 201-26140 */
export function NotificationsEmpty() {
  return (
    <Notice
      icon="check"
      title="새 알림이 없어요"
      description="여행 소식과 팔로우 요청이 여기에 모여요"
    />
  );
}

/** S49 불러오기 실패 201-32709. 설명 없이 까닭 아이콘과 짧은 제목 */
export function NotificationsError({ onRetry, error }: { onRetry: () => void; error?: unknown }) {
  return (
    <Notice
      {...errorLook(error)}
      primary={{ label: '다시 시도', icon: 'refresh', onPress: onRetry }}
    />
  );
}

/** S49 볼 수 없음 201-26179 */
export function NotificationGone({
  onList,
  onDismiss,
}: {
  onList: () => void;
  onDismiss?: () => void;
}) {
  return (
    <Notice
      icon="eye-off"
      title="볼 수 없는 알림이에요"
      primary={{ label: '알림 목록으로', icon: 'bell', onPress: onList }}
      secondary={
        onDismiss ? { label: '이 알림 지우기', icon: 'trash', onPress: onDismiss } : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.screenPaddingX,
    gap: spacing[8],
  },
  circle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[8],
  },
  title: { color: colors.text.default, textAlign: 'center' },
  description: { color: colors.text.icon, textAlign: 'center' },
  primary: { alignSelf: 'center', marginTop: spacing[16] },
  // Figma는 회색 글자 버튼이라 공통 Button(text는 파랑) 대신 직접 그린다
  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    minHeight: layout.minTouchTarget,
    paddingHorizontal: spacing[12],
  },
  secondaryText: { color: colors.text.icon },
  pressed: { opacity: 0.6 },
});
