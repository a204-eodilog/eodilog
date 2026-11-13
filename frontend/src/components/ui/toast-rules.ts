/**
 * 짧은 안내가 얼마나 오래 보일지 정한다.
 *
 * 2026-11-13 사용자 결정: 모든 안내는 화면 위에서 아래로 내려온다(아래에서 뜨던 토스트를 없앴다).
 * 종류는 보이는 시간만 가른다.
 *
 * | | 긴 안내 | 짧은 안내 |
 * | 쓰는 곳 | 버튼이 붙은 안내(되돌리기, 보기), 실패 안내, 긴 글 | 짧은 확인("복사했어요", "저장했어요", "준비 중이에요") |
 * | 보이는 시간 | 4초 | 2초 |
 * | 닫기 | 위로 밀어서, 또는 저절로 | 위로 밀어서, 또는 저절로 |
 *
 * 부르는 쪽은 toast.show·success·error를 그대로 쓴다. 버튼이 있거나 실패거나 글이 길면 자동으로 오래 보인다
 */
export type ToastKind = 'snackbar' | 'toast';
export type ToastTone = 'plain' | 'success' | 'error';

export const SNACKBAR_DURATION_MS = 4000;
export const TOAST_DURATION_MS = 2000;

/**
 * 이 글자 수부터는 2초 안에 읽기 어렵다고 보고 오래 보인다.
 * "다른 동행이 먼저 고쳤어요. 다시 시도해 주세요"처럼 실패나 충돌을 알리는 안내가 toast.show로 불리는 곳이 많다.
 * 그런 안내는 두 문장이라 길고, "저장했어요" 같은 짧은 확인은 한 문장이라 짧다
 */
export const LONG_MESSAGE_LENGTH = 20;

/** 버튼이 있으면 누를 시간이 필요하고, 실패와 긴 안내는 놓치면 안 돼서 오래 보인다 */
export function toastKind(tone: ToastTone, hasAction: boolean, message = ''): ToastKind {
  if (hasAction || tone === 'error') return 'snackbar';
  return message.length >= LONG_MESSAGE_LENGTH ? 'snackbar' : 'toast';
}

/** 그 종류가 보이는 시간. 자리는 모두 화면 위 하나다 */
export function toastPlacement(kind: ToastKind): { duration: number } {
  return { duration: kind === 'snackbar' ? SNACKBAR_DURATION_MS : TOAST_DURATION_MS };
}
