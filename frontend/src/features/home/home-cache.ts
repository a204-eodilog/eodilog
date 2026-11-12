import type { QueryClient } from '@tanstack/react-query';

/** 홈(S05) 자료의 조회 키 머리. 지도·팔로우 유무·추천이 모두 이 아래에 있다 */
export const HOME_KEY = ['home'] as const;

/**
 * 홈 자료에 "새로 받아야 함" 표시만 한다. 홈 지도·팔로우 유무·추천은 내가 팔로우한 사람으로 정해지므로
 * 팔로우하거나 끊은 곳(S44·N9·친구 목록)에서 부른다. 여기서 바로 받으면 뒤에 떠 있는 홈이 혼자 바뀌어 버려,
 * 받는 것은 홈으로 돌아올 때 한다(refetchStaleHome)
 */
export function markHomeStale(client: QueryClient) {
  return client.invalidateQueries({ queryKey: HOME_KEY, refetchType: 'none' });
}

/** 홈에 돌아왔을 때 표시된 홈 자료만 다시 받는다. 표시 없는 자료는 탭을 오갈 때마다 받지 않는다 */
export function refetchStaleHome(client: QueryClient) {
  return client.refetchQueries({
    queryKey: HOME_KEY,
    type: 'active',
    predicate: (query) => query.state.isInvalidated,
  });
}
