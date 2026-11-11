/**
 * 짧은 안내를 스낵바로 보일지 토스트로 보일지 정한다(2026-11-11 사용자 결정).
 *
 * | | 스낵바 | 토스트 |
 * | 쓰는 곳 | 버튼이 붙은 안내(되돌리기, 보기), 실패 안내 | 짧은 확인("복사했어요", "저장했어요", "준비 중이에요") |
 * | 위치 | 화면 위 | 화면 아래, 탭 바 위 |
 * | 움직임 | 위에서 내려옴 | 제자리에서 서서히 |
 * | 보이는 시간 | 4초 | 2초 |
 * | 닫기 | 위로 밀어서 | 저절로 |
 *
 * 부르는 쪽은 toast.show·success·error를 그대로 쓴다. 버튼이 있거나 실패거나 글이 길면 자동으로 스낵바가 된다
 */
export type ToastKind = 'snackbar' | 'toast';
export type ToastTone = 'plain' | 'success' | 'error';

export const SNACKBAR_DURATION_MS = 4000;
export const TOAST_DURATION_MS = 2000;

/** 토스트를 그리는 자리의 이름. 스낵바는 이름 없는 기본 자리에 그린다 */
export const TOAST_CHANNEL = 'toast';

/**
 * 이 글자 수부터는 2초 안에 읽기 어렵다고 보고 스낵바로 보인다.
 * "다른 동행이 먼저 고쳤어요. 다시 시도해 주세요"처럼 실패나 충돌을 알리는 안내가 toast.show로 불리는 곳이 많다.
 * 그런 안내는 두 문장이라 길고, "저장했어요" 같은 짧은 확인은 한 문장이라 짧다
 */
export const LONG_MESSAGE_LENGTH = 20;

/** 버튼이 있으면 누를 시간이 필요하고, 실패와 긴 안내는 놓치면 안 돼서 스낵바로 보인다 */
export function toastKind(tone: ToastTone, hasAction: boolean, message = ''): ToastKind {
  if (hasAction || tone === 'error') return 'snackbar';
  return message.length >= LONG_MESSAGE_LENGTH ? 'snackbar' : 'toast';
}

/** 그 종류가 그려질 자리와 보이는 시간 */
export function toastPlacement(kind: ToastKind): { toasterId?: string; duration: number } {
  return kind === 'snackbar'
    ? { duration: SNACKBAR_DURATION_MS }
    : { toasterId: TOAST_CHANNEL, duration: TOAST_DURATION_MS };
}
