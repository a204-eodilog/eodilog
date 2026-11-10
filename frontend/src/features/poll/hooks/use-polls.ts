import { useQuery } from '@tanstack/react-query';

import { getPolls } from '../api';
import { pickPoll } from '../poll-rules';
import type { Poll } from '../types';
import { pollsKey } from './poll-keys';

/**
 * 여행의 투표 목록 첫 쪽과 S17 메뉴로 들어왔을 때 보일 대표 투표(research R7).
 * 화면에 들어올 때마다 새로 받는다(투표 실시간 이벤트가 없다)
 */
export function usePolls(tripId: string, enabled = true) {
  const query = useQuery({
    queryKey: pollsKey(tripId),
    queryFn: ({ signal }) => getPolls(tripId, signal),
    enabled,
    refetchOnMount: 'always',
  });
  const picked: Poll | null = query.data ? pickPoll(query.data, new Date()) : null;
  return { ...query, picked };
}
