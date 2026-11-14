import { StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Spinner } from '@/components/ui/spinner';
import { colors, radius, spacing, typography } from '@/theme';

type Props = {
  onSuggest(): void;
  /** 제안을 받는 중이면 [제안 받기]가 돌아가는 표시와 '제안 받는 중…'으로 바뀌고 눌리지 않는다 */
  suggesting: boolean;
  /** 없으면 [직접 추가]를 그리지 않는다. 아래 입력 줄이 이미 열려 있을 때다 */
  onAddDirect?: () => void;
};

/**
 * S27 항목 없음(Figma 201-15518). 가방 그림, 안내, 시작하는 방법 두 가지.
 * 전구와 더하기 아이콘만 나란히 있으면 무엇을 하는 버튼인지 알기 어렵고 보기에도 어색해서(2026-11-14 사용자 지적),
 * 저장 탭 빈 화면처럼 아이콘·이름·설명이 있는 선택 카드로 둔다
 */
export function ChecklistEmpty({ onSuggest, suggesting, onAddDirect }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.badge}>
        {/* 가방 아이콘이 없어 여행 가방 아이콘을 쓴다 */}
        <Icon name="trip" size={32} color={colors.text.icon} />
      </View>
      <Text style={[typography.title1, styles.title]}>준비물이 없어요</Text>
      <Text style={[typography.body, styles.body]}>날씨·일정 기준 준비물</Text>
      <View style={styles.starts}>
        <StartCard
          icon="bulb"
          title={suggesting ? '제안 받는 중…' : '제안 받기'}
          hint="날씨와 일정에 맞춰 골라 줘요"
          busy={suggesting}
          onPress={onSuggest}
        />
        {onAddDirect ? (
          <StartCard
            icon="pencil"
            title="직접 추가"
            hint="챙길 것을 바로 적어요"
            onPress={onAddDirect}
          />
        ) : null}
      </View>
    </View>
  );
}

function StartCard({
  icon,
  title,
  hint,
  busy = false,
  onPress,
}: {
  icon: IconName;
  title: string;
  hint: string;
  busy?: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={hint}
      accessibilityState={{ disabled: busy, busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [styles.start, pressed && styles.pressed]}
    >
      <View style={styles.startIcon}>
        {busy ? (
          <Spinner color={colors.brand.primary} />
        ) : (
          <Icon name={icon} size={22} color={colors.brand.primary} />
        )}
      </View>
      <View style={styles.startText}>
        <Text style={[typography.bodyBold, styles.startTitle]}>{title}</Text>
        <Text style={[typography.caption, styles.startHint]}>{hint}</Text>
      </View>
      {busy ? null : <Icon name="chevron-right" size={20} color={colors.text.muted} />}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingHorizontal: spacing[20] },
  badge: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.text.default, marginTop: spacing[20], textAlign: 'center' },
  body: { color: colors.text.icon, marginTop: spacing[8], textAlign: 'center' },
  // 저장 탭 빈 화면의 선택 카드와 같은 모양. 너무 넓게 퍼지지 않게 폭을 묶는다
  starts: {
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: 360,
    marginHorizontal: 'auto',
    gap: spacing[10],
    marginTop: spacing[24],
  },
  start: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[14],
    padding: spacing[16],
    borderRadius: radius.lg,
    backgroundColor: colors.brand.primaryBg,
  },
  startIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.white,
  },
  startText: { flex: 1 },
  startTitle: { color: colors.text.default },
  startHint: { color: colors.text.sub },
  pressed: { opacity: 0.8 },
});
