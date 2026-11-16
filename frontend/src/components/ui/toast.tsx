import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Easing, withTiming, type EntryExitAnimationFunction } from 'react-native-reanimated';
import { Toaster, toast as sonner } from 'sonner-native';

import { haptic } from '@/lib/haptics';
import { colors, radius, spacing, typography } from '@/theme';

import { Icon, type IconName } from './icon';
import { SNACKBAR_DURATION_MS, toastKind, toastPlacement, type ToastTone } from './toast-rules';

/** 안내 오른쪽 알약 버튼. "보기", "되돌리기" */
export type ToastAction = { label: string; onPress: () => void };

type ToastOptions = {
  /** 버튼이 있으면 누를 시간을 주려고 4초 보인다 */
  action?: ToastAction;
};

/** 안내 왼쪽 동그라미. 색과 그림으로 잘 됨, 안 됨, 알림을 가른다(색만으로 가르지 않는다) */
const TONE: Record<ToastTone, { icon: IconName; color: string; bg: string }> = {
  plain: { icon: 'bell', color: colors.brand.primary, bg: colors.brand.primaryBg },
  success: { icon: 'check', color: colors.status.success, bg: colors.status.successBg },
  error: { icon: 'alert', color: colors.status.danger, bg: colors.status.dangerBg },
};

function ToneIcon({ tone }: { tone: ToastTone }) {
  const t = TONE[tone];
  return (
    <View style={[styles.tone, { backgroundColor: t.bg }]}>
      <Icon name={t.icon} size={15} color={t.color} />
    </View>
  );
}

let seq = 0;

/**
 * 안내 한 장. 흰 알약이 글자 길이만큼만 차지하고 화면 위 가운데에 선다.
 * 왼쪽 동그라미, 글, (있으면) 오른쪽 알약 버튼이 한 줄에 놓인다. 글이 길면 글만 줄을 바꾼다.
 * 라이브러리의 기본 카드는 글 칸이 남는 폭을 다 차지하거나, 줄이면 글이 잘려서 직접 그린다
 */
function ToastCard({
  tone,
  message,
  action,
  onAction,
}: {
  tone: ToastTone;
  message: string;
  action?: ToastAction;
  onAction: () => void;
}) {
  return (
    <View style={styles.card} accessibilityRole="alert">
      <ToneIcon tone={tone} />
      <Text style={styles.message}>{message}</Text>
      {action ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          hitSlop={8}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text style={styles.actionText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function present(tone: ToastTone, message: string, opts?: ToastOptions) {
  const id = `toast-${(seq += 1)}`;
  const { duration } = toastPlacement(toastKind(tone, !!opts?.action, message));
  return sonner.custom(
    <ToastCard
      tone={tone}
      message={message}
      action={opts?.action}
      onAction={() => {
        opts?.action?.onPress();
        sonner.dismiss(id);
      }}
    />,
    { id, duration },
  );
}

/**
 * 짧은 안내. 화면 어디서든 toast.show('문구')로 띄운다. 앱 시작 레이아웃에 <ToastHost />가 한 번 있어야 한다.
 *
 * 모든 안내는 화면 위에서 내려오는 흰 알약이다(2026-11-13 사용자 결정, toast-rules).
 * 짧은 확인은 2초, 버튼이 붙었거나 실패거나 글이 길면(20자부터) 4초 보인다. 위로 밀면 바로 닫힌다.
 * toast.success('강릉 바다 여행에 담았어요', { action: { label: '보기', onPress: openTrip } })
 */
export const toast = {
  /** 기본 안내 */
  show: (message: string, opts?: ToastOptions) => present('plain', message, opts),
  /** 잘 됐을 때. "링크를 복사했어요" */
  success: (message: string, opts?: ToastOptions) => present('success', message, opts),
  /** 안 됐을 때. 다시 시도가 필요하면 화면 안 오류 상태를 쓰고, 여기는 가벼운 실패에만 */
  error: (message: string, opts?: ToastOptions) => {
    // 실패 안내가 뜰 때 실패 진동
    haptic.error();
    return present('error', message, opts);
  },
};

/** 내려오는 시간과 출발 높이. 라이브러리 기본은 20px만 움직여 내려오는 느낌이 없다 */
const ENTER_MS = 420;
const EXIT_MS = 220;
const FROM_Y = -120;
/** 자리를 조금 지나쳤다가 돌아와 멈춘다 */
const overshoot = Easing.out(Easing.back(1.4));
const easeIn = Easing.bezierFn(0.4, 0, 1, 1);

/** 화면 위 바깥에서 떨어져 살짝 튕기며 자리에 멈춘다 */
const dropIn: EntryExitAnimationFunction = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: FROM_Y }, { scale: 0.92 }] },
    animations: {
      opacity: withTiming(1, { duration: ENTER_MS / 2 }),
      transform: [
        { translateY: withTiming(0, { duration: ENTER_MS, easing: overshoot }) },
        { scale: withTiming(1, { duration: ENTER_MS, easing: overshoot }) },
      ],
    },
  };
};

/** 왔던 위쪽으로 빠르게 올라가 사라진다 */
const liftOut: EntryExitAnimationFunction = () => {
  'worklet';
  return {
    initialValues: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
    animations: {
      opacity: withTiming(0, { duration: EXIT_MS }),
      transform: [
        { translateY: withTiming(FROM_Y / 2, { duration: EXIT_MS, easing: easeIn }) },
        { scale: withTiming(0.96, { duration: EXIT_MS, easing: easeIn }) },
      ],
    },
  };
};

/** 안내가 차지할 수 있는 가장 넓은 폭. 화면 양옆이 보이게 남긴다 */
const CARD_MAX_WIDTH = '86%';
/** 한 줄일 때는 알약으로 보이고, 두 줄이 되면 둥근 네모로 보이는 둥글기. 끝까지 둥글리면 두 줄일 때 글이 모서리에 붙는다 */
const CARD_RADIUS = 22;

const styles = StyleSheet.create({
  // 흰 알약. 글자 길이만큼만 차지하고 가운데에 선다. 어느 화면 위에서도 떠 보이게 옅은 테두리와 그림자를 둔다.
  // 글이 길어도 화면 폭을 다 채우지 않게 폭을 묶는다. 넘치는 글은 줄을 바꾼다
  card: {
    alignSelf: 'center',
    maxWidth: CARD_MAX_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    paddingVertical: spacing[8],
    paddingLeft: spacing[8],
    paddingRight: spacing[14],
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: colors.line.default,
    backgroundColor: colors.surface.white,
    boxShadow: `0 8px 24px ${colors.shadow}`,
  },
  tone: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 길면 줄어들어 줄을 바꾼다. 짧으면 글자 폭 그대로
  message: { ...typography.subBold, flexShrink: 1, color: colors.text.default },
  action: {
    marginLeft: spacing[4],
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[12],
    borderRadius: radius.full,
    backgroundColor: colors.brand.primaryBg,
  },
  actionText: { ...typography.captionBold, color: colors.brand.primary },
  pressed: { opacity: 0.7 },
});

/**
 * 앱 시작 레이아웃에 한 번만 둔다. 자리는 화면 위 하나다.
 * offset을 주지 않으면 상태 표시줄 높이 + 8만큼 띄우고, 위로 밀면 닫힌다
 */
export function ToastHost() {
  return (
    <Toaster
      position="top-center"
      duration={SNACKBAR_DURATION_MS}
      swipeToDismissDirection="up"
      animation={{ enter: dropIn, exit: liftOut }}
    />
  );
}
