import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Easing, withTiming, type EntryExitAnimationFunction } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Toaster, toast as sonner } from 'sonner-native';

import { haptic } from '@/lib/haptics';
import { colors, radius, spacing, typography } from '@/theme';

import { Icon } from './icon';

import {
  SNACKBAR_DURATION_MS,
  TOAST_CHANNEL,
  TOAST_DURATION_MS,
  toastKind,
  toastPlacement,
  type ToastTone,
} from './toast-rules';

/** 스낵바 오른쪽 글자 버튼. "보기", "되돌리기" */
export type ToastAction = { label: string; onPress: () => void };

type ToastOptions = {
  /** 버튼이 있으면 스낵바로 보인다(누를 시간을 주려고 4초) */
  action?: ToastAction;
};

/** 버튼이 있거나 실패면 스낵바 자리로, 아니면 토스트 자리로 보낸다(toast-rules) */
function options(tone: ToastTone, message: string, opts?: ToastOptions) {
  const placement = toastPlacement(toastKind(tone, !!opts?.action, message));
  if (!opts?.action) return placement;
  const { label, onPress } = opts.action;
  return { ...placement, action: { label, onClick: onPress } };
}

/**
 * 짧은 안내. 화면 어디서든 toast.show('문구')로 띄운다. 앱 시작 레이아웃에 <ToastHost />가 한 번 있어야 한다.
 *
 * 두 가지 모양으로 나뉜다(2026-11-11 사용자 결정, toast-rules).
 * - 토스트: "링크를 복사했어요", "저장했어요", "준비 중이에요" 같은 짧은 확인. 화면 아래에서 제자리에 서서히 나타났다 2초 뒤 사라진다
 * - 스낵바: 버튼이 붙은 안내와 실패 안내. 화면 위에서 내려와 4초 보이고 위로 밀어 닫는다
 *
 * 부르는 쪽은 고르지 않는다. 버튼을 넘기거나 toast.error를 쓰거나 글이 길면(20자부터) 스낵바가 된다.
 * toast.success('강릉 바다 여행에 담았어요', { action: { label: '보기', onPress: openTrip } })
 */
export const toast = {
  /** 기본 안내 */
  show: (message: string, opts?: ToastOptions) => sonner(message, options('plain', message, opts)),
  /** 잘 됐을 때. "링크를 복사했어요" */
  success: (message: string, opts?: ToastOptions) =>
    sonner.success(message, options('success', message, opts)),
  /** 안 됐을 때. 다시 시도가 필요하면 화면 안 오류 상태를 쓰고, 여기는 가벼운 실패에만 */
  error: (message: string, opts?: ToastOptions) => {
    // 실패 안내가 뜰 때 실패 진동
    haptic.error();
    return sonner.error(message, options('error', message, opts));
  },
  /**
   * 완료 확인을 화면 위 한 줄 스낵바로. [민트 체크] 문구 ... [보기]처럼 세 요소를 한 줄에 둔다.
   * 버튼이 없어도 위 자리에 뜬다(다른 안내처럼 아래 토스트로 옮겨 가지 않는다). 버튼이 있으면 4초, 없으면 2초.
   * 지금은 개인 즐겨찾기 저장 완료(S08)에만 쓴다
   */
  check: (message: string, opts?: ToastOptions) => {
    const id = `check-${Date.now()}`;
    const action = opts?.action;
    return sonner.custom(
      <CheckSnackbar
        message={message}
        action={
          action
            ? {
                label: action.label,
                onPress: () => {
                  sonner.dismiss(id);
                  action.onPress();
                },
              }
            : undefined
        }
      />,
      { id, duration: action ? SNACKBAR_DURATION_MS : TOAST_DURATION_MS },
    );
  },
};

/** toast.check의 모양. 짙은 차콜 바탕, 기본 높이 52, 큰 글자·좁은 화면에서는 문구가 두 줄로 늘어난다 */
function CheckSnackbar({ message, action }: { message: string; action?: ToastAction }) {
  return (
    <View style={styles.check} accessibilityLiveRegion="polite">
      <View style={styles.checkLead}>
        <Icon name="check" size={18} color={colors.status.successMid} />
        <Text style={[typography.bodyMedium, styles.checkText]}>{message}</Text>
      </View>
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          hitSlop={spacing[8]}
          style={({ pressed }) => [styles.checkAction, pressed && styles.pressed]}
        >
          <Text style={[typography.bodyMedium, styles.checkActionText]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** 스낵바가 내려오는 시간과 출발 높이. 라이브러리 기본은 20px만 움직여 내려오는 느낌이 없다 */
const ENTER_MS = 350;
const ENTER_FROM_Y = -120;
const easeOut = Easing.bezierFn(0.165, 0.84, 0.44, 1);

/** 스낵바: 화면 위 바깥에서 떨어져 자리에 멈춘다 */
const slideDown: EntryExitAnimationFunction = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: ENTER_FROM_Y }] },
    animations: {
      opacity: withTiming(1, { duration: ENTER_MS / 2 }),
      transform: [{ translateY: withTiming(0, { duration: ENTER_MS, easing: easeOut }) }],
    },
  };
};

/** 토스트가 나타나고 사라지는 시간 */
const FADE_MS = 150;

/** 토스트: 움직이지 않고 제자리에서 서서히 나타난다 */
const fadeIn: EntryExitAnimationFunction = () => {
  'worklet';
  return {
    initialValues: { opacity: 0 },
    animations: { opacity: withTiming(1, { duration: FADE_MS }) },
  };
};

/** 토스트: 제자리에서 서서히 사라진다 */
const fadeOut: EntryExitAnimationFunction = () => {
  'worklet';
  return {
    initialValues: { opacity: 1 },
    animations: { opacity: withTiming(0, { duration: FADE_MS }) },
  };
};

/** 하단 탭 바의 높이(위아래 여백 포함). 토스트를 그 위에 띄운다 */
const TAB_BAR_HEIGHT = 64;

const toastOptions = {
  style: {
    backgroundColor: colors.text.strong,
    borderRadius: radius.md,
    borderWidth: 0,
  },
  titleStyle: { ...typography.bodyMedium, color: colors.text.inverse },
  actionButtonStyle: {
    backgroundColor: 'transparent',
    paddingHorizontal: spacing[8],
  },
  actionButtonTextStyle: { ...typography.bodyMedium, color: colors.brand.primarySoft },
};

const styles = StyleSheet.create({
  // 좌우 16(기본 스낵바와 같은 자리), 기본 높이 52, 둥글기 12, 가벼운 그림자
  check: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    minHeight: 52,
    marginHorizontal: spacing[16],
    // 위아래 4: [보기] 누르는 칸 44가 들어가도 기본 높이 52를 넘지 않는다. 문구가 두 줄이면 그만큼 늘어난다
    paddingVertical: spacing[4],
    paddingLeft: spacing[16],
    paddingRight: spacing[8],
    borderRadius: radius.md,
    backgroundColor: colors.text.strong,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  // 체크와 문구는 8 간격으로 묶고, 문구가 길면 이 묶음 안에서 줄을 바꾼다
  checkLead: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    paddingRight: spacing[8],
  },
  checkText: { flexShrink: 1, color: colors.text.inverse },
  // [보기] 바탕·테두리 없는 글자 버튼. 누르는 칸 높이 44
  checkAction: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing[8],
  },
  checkActionText: { color: colors.brand.primarySoft },
  pressed: { opacity: 0.6 },
});

/**
 * 앱 시작 레이아웃에 한 번만 둔다. 자리가 둘이다.
 * - 스낵바(이름 없는 기본 자리): 화면 위. offset을 주지 않으면 상태 표시줄 높이 + 8만큼 띄우고, 위로 밀면 닫힌다
 * - 토스트: 화면 아래 탭 바 위. 저절로 닫힌다
 */
export function ToastHost() {
  const insets = useSafeAreaInsets();
  return (
    <>
      <Toaster
        position="top-center"
        duration={SNACKBAR_DURATION_MS}
        swipeToDismissDirection="up"
        animation={{ enter: slideDown }}
        toastOptions={toastOptions}
      />
      <Toaster
        id={TOAST_CHANNEL}
        position="bottom-center"
        duration={TOAST_DURATION_MS}
        offset={insets.bottom + TAB_BAR_HEIGHT + spacing[8]}
        animation={{ enter: fadeIn, exit: fadeOut }}
        toastOptions={toastOptions}
      />
    </>
  );
}
