import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { toast } from '@/components/ui';

import { getFeed, likeFeed, unlikeFeed } from '../api';
import { toFeedDetail } from '../feed-rules';
import type { Feed } from '../types';

export const feedKey = (feedId: string) => ['feeds', feedId] as const;

/** S07 실제 화면의 값과 좋아요. 좋아요는 먼저 화면에 바꾸고, 실패하면 되돌린다 */
export function useFeed(feedId: string) {
  const queryClient = useQueryClient();
  const key = feedKey(feedId);
  const feed = useQuery({ queryKey: key, queryFn: () => getFeed(feedId) });
  // 빠르게 두 번 누르면 다시 그리기 전이라 isPending이 아직 false라서 ref로 첫 누름에서 막는다
  const liking = useRef(false);

  const like = useMutation({
    mutationFn: async (next: boolean): Promise<{ liked: boolean; count: number } | null> => {
      if (next) return likeFeed(feedId);
      await unlikeFeed(feedId);
      return null;
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData<Feed>(key);
      if (before) {
        queryClient.setQueryData<Feed>(key, {
          ...before,
          likedByMe: next,
          likeCount: Math.max(0, before.likeCount + (next ? 1 : -1)),
        });
      }
      return { before };
    },
    onSuccess: (result) => {
      // PUT은 서버가 센 수를 돌려준다. DELETE(204)는 화면에서 뺀 수를 그대로 둔다
      if (!result) return;
      queryClient.setQueryData<Feed>(key, (old) =>
        old ? { ...old, likedByMe: result.liked, likeCount: result.count } : old,
      );
    },
    onError: (_e, _next, context) => {
      if (context?.before) queryClient.setQueryData(key, context.before);
      toast.show('좋아요를 바꾸지 못했어요. 다시 눌러 주세요');
    },
    // 내 공동 피드(S38 좋아요 수·S37 핀·S39·S40)는 ['me', 'feeds'] 캐시를 쓴다. 30초 안에 돌아가도 새 수가 보이게 한다(!298 리뷰)
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['me', 'feeds'] }),
  });

  return {
    state: feed.isError
      ? ('error' as const)
      : feed.data
        ? ('ready' as const)
        : ('loading' as const),
    detail: feed.data ? toFeedDetail(feed.data) : undefined,
    retry: () => void feed.refetch(),
    toggleLike: () => {
      if (!feed.data || like.isPending || liking.current) return;
      liking.current = true;
      like.mutate(!feed.data.likedByMe, {
        onSettled: () => {
          liking.current = false;
        },
      });
    },
  };
}
