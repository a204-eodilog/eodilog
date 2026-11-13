import { describe, expect, it } from '@jest/globals';

import { toastKind, toastPlacement } from './toast-rules';

describe('toastKind', () => {
  it('짧은 확인은 토스트다', () => {
    expect(toastKind('plain', false)).toBe('toast');
    expect(toastKind('success', false)).toBe('toast');
  });

  it('버튼이 붙으면 스낵바다', () => {
    expect(toastKind('plain', true)).toBe('snackbar');
    expect(toastKind('success', true)).toBe('snackbar');
  });

  it('실패는 버튼이 없어도 스낵바다', () => {
    expect(toastKind('error', false)).toBe('snackbar');
    expect(toastKind('error', true)).toBe('snackbar');
  });

  it('글이 길면 버튼이 없어도 스낵바다', () => {
    expect(toastKind('plain', false, '저장했어요')).toBe('toast');
    expect(toastKind('plain', false, '투표가 마감됐어요')).toBe('toast');
    expect(toastKind('plain', false, '다른 동행이 먼저 고쳤어요. 다시 시도해 주세요')).toBe(
      'snackbar',
    );
    expect(toastKind('plain', false, '후보를 넣지 못했어요. 다시 눌러 주세요')).toBe('snackbar');
  });
});

describe('toastPlacement', () => {
  it('버튼이 붙었거나 긴 안내는 4초 보인다', () => {
    expect(toastPlacement('snackbar')).toEqual({ duration: 4000 });
  });

  it('짧은 확인은 2초 보이고, 자리는 따로 두지 않는다', () => {
    expect(toastPlacement('toast')).toEqual({ duration: 2000 });
  });
});
