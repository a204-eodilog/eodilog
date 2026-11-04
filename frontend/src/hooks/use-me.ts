import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/api/client';
import type { DataResponse, MyProfile } from '@/api/types';

export const ME_QUERY_KEY = ['me'] as const;

/** 내 프로필. 여러 기능이 "나"를 알아야 할 때 쓴다(동행 목록에서 나 빼기, "영광님," 인사 등) */
export function useMe() {
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => {
      const { data } = await apiClient.get<DataResponse<MyProfile>>('/me');
      return data.data;
    },
    staleTime: 5 * 60_000,
  });
}
