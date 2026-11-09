import type { QueryClient } from '@tanstack/react-query';

import { blockRoom } from './hooks/block-room';

/** 이어 받기·빈칸 채우기 중 볼 수 없는 대화방이라는 응답을 받으면 차단 정리를 한다 */
export function catchUpOptions(queryClient: QueryClient) {
  return { onBlocked: (tripId: string) => void blockRoom(queryClient, tripId) };
}
