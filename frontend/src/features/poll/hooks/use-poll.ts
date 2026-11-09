import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { API_ERROR, toApiError } from '@/api/errors';

import { getPoll } from '../api';
import { pollViewState } from '../poll-rules';
import { pollKey } from './poll-keys';

/** 마감 시각이 지났는데 서버가 아직 OPEN으로 줄 때 다시 받는 간격 */
const CLOSING_RETRY_MS = 3_000;
/** 이보다 먼 마감은 타이머를 걸지 않는다(앱 복귀 때 새로 받는다) */
const MAX_TIMER_MS = 24 * 60 * 60 * 1000;

/**
 * 투표 하나. 앱이 앞으로 돌아오면 공통 focusManager가 다시 받는다(api/query-focus.ts).
 * 마감 시각이 되면 다시 받아 결과 화면으로 바뀌게 하고, 서버가 아직 마감 전이면 잠시 뒤 또 받는다.
 * 없거나 다른 여행의 투표, 볼 수 없는 여행은 notFound다(재시도하지 않는다)
 */
export function usePoll(tripId: string, pollId: string | null) {
  const query = useQuery({
    queryKey: pollKey(tripId, pollId ?? ''),
    queryFn: ({ signal }) => getPoll(tripId, pollId as string, signal),
    enabled: pollId !== null,
    retry: (count, e) => toApiError(e).status !== 404 && count < 1,
    refetchInterval: (q) =>
      q.state.data && pollViewState(q.state.data, new Date()) === 'closing'
        ? CLOSING_RETRY_MS
        : false,
  });

  const closesAt = query.data?.status === 'OPEN' ? query.data.closesAt : null;
  const { refetch } = query;
  useEffect(() => {
    if (!closesAt) return;
    const wait = Date.parse(closesAt) - Date.now();
    if (wait <= 0 || wait > MAX_TIMER_MS) return;
    const timer = setTimeout(() => void refetch(), wait + 500);
    return () => clearTimeout(timer);
  }, [closesAt, refetch]);

  const error = query.error ? toApiError(query.error) : null;
  const notFound =
    error !== null &&
    (error.code === API_ERROR.POLL_NOT_FOUND ||
      error.code === API_ERROR.TRIP_NOT_FOUND ||
      error.status === 404);
  return { ...query, notFound };
}
