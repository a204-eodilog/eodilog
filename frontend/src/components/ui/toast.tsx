import { Toaster, toast as sonner } from 'sonner-native';

import { colors, radius, spacing, typography } from '@/theme';

/** 토스트 오른쪽 글자 버튼. "보기", "되돌리기" */
export type ToastAction = { label: string; onPress: () => void };

type ToastOptions = {
  /** 버튼이 있으면 누를 시간을 주려고 조금 더 오래 보인다 */
  action?: ToastAction;
};

/** 버튼이 있는 토스트는 4초 보인다(기본 2.2초) */
const ACTION_DURATION_MS = 4000;

function options(opts?: ToastOptions) {
  if (!opts?.action) return undefined;
  const { label, onPress } = opts.action;
  return { action: { label, onClick: onPress }, duration: ACTION_DURATION_MS };
}

/**
 * 짧은 알림. "링크를 복사했어요", "저장했어요"처럼 잠깐 보였다 사라지는 안내에 쓴다.
 * 화면 어디서든 toast.show('문구')로 띄운다. 앱 시작 레이아웃에 <ToastHost />가 한 번 있어야 한다.
 *
 * 버튼이 필요하면 두 번째 인자로 넘긴다.
 * toast.success('강릉 바다 여행에 담았어요', { action: { label: '보기', onPress: openTrip } })
 */
export const toast = {
  /** 기본 안내 */
  show: (message: string, opts?: ToastOptions) => sonner(message, options(opts)),
  /** 잘 됐을 때. "링크를 복사했어요" */
  success: (message: string, opts?: ToastOptions) => sonner.success(message, options(opts)),
  /** 안 됐을 때. 다시 시도가 필요하면 화면 안 오류 상태를 쓰고, 토스트는 가벼운 실패에만 */
  error: (message: string, opts?: ToastOptions) => sonner.error(message, options(opts)),
};

/** 앱 시작 레이아웃에 한 번만 둔다. */
export function ToastHost() {
  return (
    <Toaster
      position="bottom-center"
      offset={88}
      duration={2200}
      swipeToDismissDirection="up"
      toastOptions={{
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
      }}
    />
  );
}
