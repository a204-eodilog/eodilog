import { isAxiosError } from 'axios';

import type { IconName } from '@/components/ui/icon';

/** 화면 전체 오류의 아이콘과 짧은 제목. 설명 문장은 보이지 않는다 */
export type ErrorLook = { icon: IconName; title: string };

/**
 * 오류를 아이콘과 짧은 제목으로 바꾼다.
 * 서버에 닿지 못한 요청만 연결 끊김으로 보인다. 작업 실패처럼 요청 밖의 오류를 연결 문제로 보이면 안 된다.
 * 403·404는 볼 수 없음, 나머지는 불러오지 못함.
 */
export function errorLook(error: unknown): ErrorLook {
  if (isAxiosError(error)) {
    const status = error.response?.status;
    if (status === undefined) return { icon: 'wifi-off', title: '연결이 끊겼어요' };
    if (status === 403 || status === 404) return { icon: 'lock', title: '볼 수 없어요' };
  }
  return { icon: 'alert', title: '불러오지 못했어요' };
}
