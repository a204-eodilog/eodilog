import { toApiError } from '@/api/errors';
import { waitForRefresh } from '@/api/session';
import { useSessionStore } from '@/stores/session-store';

import { deleteAccount, deleteCurrentSession } from './api';

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
  // 캐시 비우기·채팅 정리·저장소 지우기는 clearSession 한 곳에서 한다(토큰 만료 로그아웃과 같은 정리)
  await useSessionStore.getState().clearSession();
}

/**
 * 회원 탈퇴. 로그아웃과 달리 서버가 탈퇴를 받아야만 기기의 토큰을 지운다(실패하면 그대로 로그인 상태로 남아
 * 다시 시도할 수 있다). 갱신 중이면 갱신이 끝난 뒤 보낸다.
 *
 * 401은 탈퇴가 이미 된 것으로 본다. 서버가 탈퇴를 처리한 뒤 응답이 끊겨 다시 누르면 토큰이 이미 폐기돼 401이
 * 나고, 그 사이 클라이언트가 갱신까지 실패해 "로그인이 만료됐어요" 상태로 바꿔 놓았을 수 있다. 그 표시를 지우고
 * 탈퇴 성공과 같이 끝낸다
 */
export async function withdraw(): Promise<void> {
  await waitForRefresh();
  try {
    await deleteAccount();
  } catch (error) {
    if (toApiError(error).status !== 401) throw error;
  }
  // 캐시 비우기는 clearSession이 한다(로그아웃과 같은 정리)
  await useSessionStore.getState().clearSession();
}
