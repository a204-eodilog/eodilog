import { waitForRefresh } from '@/api/session';
import { queryClient } from '@/api/query-client';
import { useSessionStore } from '@/stores/session-store';

import { deleteCurrentSession } from './api';

/**
 * 로그아웃. 서버 세션 폐기를 시도하되, 실패하거나 오프라인이어도 기기의 토큰은 지운다.
 * 갱신 중이면 갱신이 끝난 뒤 진행한다. 겹치면 서버가 로그인 전체를 끊을 수 있다.
 */
export async function signOut(): Promise<void> {
  await waitForRefresh();
  try {
    await deleteCurrentSession();
  } catch {
    // 서버 폐기는 확인하지 못했지만 이 기기에서는 로그아웃한다
  }
  queryClient.clear();
  await useSessionStore.getState().clearSession();
}
