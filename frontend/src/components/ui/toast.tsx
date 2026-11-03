import { Toaster, toast as sonner } from 'sonner-native';

import { colors, radius, typography } from '@/theme';

/**
 * 짧은 알림. "링크를 복사했어요", "저장했어요"처럼 잠깐 보였다 사라지는 안내에 쓴다.
 * 화면 어디서든 toast('문구')로 띄운다. 앱 시작 레이아웃에 <ToastHost />가 한 번 있어야 한다.
 */
export const toast = {
  /** 기본 안내 */
  show: (message: string) => sonner(message),
  /** 잘 됐을 때. "링크를 복사했어요" */
  success: (message: string) => sonner.success(message),
  /** 안 됐을 때. 다시 시도가 필요하면 화면 안 오류 상태를 쓰고, 토스트는 가벼운 실패에만 */
  error: (message: string) => sonner.error(message),
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
      }}
    />
  );
}
