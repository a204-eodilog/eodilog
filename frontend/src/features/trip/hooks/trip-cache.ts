import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';

import type { PageResponse } from '@/api/types';
import { forgetChatForTrip } from '@/features/chat/hooks/chat-forget';
import { CHAT_ROOMS_KEY } from '@/features/chat/hooks/chat-keys';

import { getTrip } from '../api';
import { forgetInviteLink } from '../invite-storage';
import type { Trip } from '../types';

import { MY_TRIPS_KEY } from './use-my-trips';
import { tripKey } from './use-trip';

/** 다른 팀원의 N4 내 여행 목록(features/my-trips) 캐시 키. 여행이 바뀌면 함께 새로 받게 한다 */
const N4_MY_TRIPS_KEY = ['me', 'trips'] as const;

/** 여행 탭 목록과 N4 목록을 모두 새로 받게 한다. 만들기·수정·넘기기·내보내기·나가기·삭제 뒤에 부른다 */
export function invalidateTripLists(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: MY_TRIPS_KEY }),
    queryClient.invalidateQueries({ queryKey: N4_MY_TRIPS_KEY }),
  ]);
}

/**
 * 새 여행에 들어간 뒤(만들기·초대 수락) 부른다. 여행 목록과 함께 채팅 탭 대화방 목록도 새로 받게 한다.
 * 서버는 여행을 만들거나 초대를 수락할 때 대화방에도 함께 넣는데, 채팅 탭은 앱을 켤 때부터 떠 있어
 * 탭을 옮겨도 다시 받지 않는다. 그래서 그대로 두면 새 대화방이 당겨서 새로고침하기 전까지 보이지 않는다.
 * 다시 받은 목록에 나타난 방은 예전에 내보내져 생긴 차단 표시도 풀린다(use-chat-rooms)
 */
export function invalidateAfterJoin(queryClient: QueryClient) {
  return Promise.all([
    invalidateTripLists(queryClient),
    queryClient.invalidateQueries({ queryKey: CHAT_ROOMS_KEY }),
  ]);
}

/**
 * 409·403을 받은 뒤 여행을 다시 받는다(research R4). 받은 최신 여행을 돌려준다.
 * 다시 받지 못하면(그 사이 나가졌거나 연결 끊김) 캐시에 남은 여행이나 undefined다
 */
export async function refreshTripAfterConflict(
  queryClient: QueryClient,
  tripId: string,
): Promise<Trip | undefined> {
  try {
    // 화면이 여행을 보고 있지 않아도 받도록 fetchQuery로 받는다. 결과는 같은 캐시에 들어간다
    return await queryClient.fetchQuery({
      queryKey: tripKey(tripId),
      queryFn: () => getTrip(tripId),
      staleTime: 0,
    });
  } catch {
    return queryClient.getQueryData<Trip>(tripKey(tripId));
  }
}

/**
 * 여행 탭 목록과 N4 목록 캐시에서 그 여행을 바로 뺀다. 받는 중인 목록 요청은 먼저 멈춰
 * 예전 응답이 뺀 여행을 다시 넣지 않게 한다. 서버 목록은 forgetTrip의 무효화로 다시 받아 맞춘다
 */
export async function dropFromTripLists(queryClient: QueryClient, tripId: string) {
  await Promise.all([
    queryClient.cancelQueries({ queryKey: MY_TRIPS_KEY }),
    queryClient.cancelQueries({ queryKey: N4_MY_TRIPS_KEY }),
  ]);
  queryClient.setQueryData<InfiniteData<PageResponse<Trip>>>(MY_TRIPS_KEY, (old) =>
    old
      ? {
          ...old,
          pages: old.pages.map((p) => ({ ...p, data: p.data.filter((t) => t.id !== tripId) })),
        }
      : old,
  );
  // N4 목록은 다른 팀원 기능이라 모양(MyTrip[])에서 id만 본다
  queryClient.setQueryData<{ id: string }[]>(N4_MY_TRIPS_KEY, (old) =>
    old ? old.filter((t) => t.id !== tripId) : old,
  );
}

/**
 * 나간·삭제한 여행의 캐시를 모두 지운다. ['trips', tripId]로 시작하는 여행·경비·정산·초대 링크가 다 지워진다.
 * 이동한 뒤에 부른다. 먼저 지우면 아직 떠 있는 화면이 다시 받아 404를 받는다
 */
export async function forgetTrip(queryClient: QueryClient, tripId: string) {
  await queryClient.cancelQueries({ queryKey: tripKey(tripId) });
  queryClient.removeQueries({ queryKey: tripKey(tripId) });
  await invalidateTripLists(queryClient);
}

/**
 * 나가기·여행 삭제 뒤 공통 마무리(research R5, contracts/routes.md).
 * 쌓인 상세·설정 화면을 모두 닫고 여행 탭으로 간 뒤 그 여행의 캐시와 이 기기의 초대 링크를 지운다.
 * 스택을 비워야 뒤로 가기로 나간 여행에 돌아가지 않는다
 */
export async function exitTrip(queryClient: QueryClient, tripId: string) {
  // 이동하기 전에 목록 캐시에서 먼저 뺀다. 그러지 않으면 목록을 새로 받는 동안(실서버 약 1초) 나간 여행이 보인다(FR-028)
  await dropFromTripLists(queryClient, tripId);
  // 채팅 탭 목록에서도 그 여행의 대화방을 바로 빼고 보내는 중 메시지를 지운다(채팅 명세 FR-026).
  // 대화방·메시지 캐시는 ['trips', tripId] 아래라 아래 forgetTrip이 함께 지운다
  forgetChatForTrip(queryClient, tripId);
  if (router.canDismiss()) router.dismissAll();
  // replace는 탭 묶음을 새로 만들어 첫 탭(홈)부터 그릴 수 있다. 이미 있는 탭 묶음에서 여행 탭으로만 옮긴다
  router.navigate('/trips');
  await forgetTrip(queryClient, tripId);
  await forgetInviteLink(tripId).catch(() => undefined);
}
