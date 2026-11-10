import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { router } from 'expo-router';
import { useState } from 'react';

import { toast } from '@/components/ui';
import { useMe } from '@/hooks/use-me';

import {
  getMyFollowers,
  getOwnFeeds,
  getTripCompanions,
  saveVisibility,
  viewerRows,
  visibilityChanged,
} from '../visibility';

const OWN_FEEDS_KEY = ['me', 'feeds', 'own'] as const;

/** S39 실제 화면의 값. 숨김은 화면에서 바꾸다가 [저장]에서 한 번에 보낸다(전체 교체) */
export function useVisibility(feedId: string) {
  const queryClient = useQueryClient();
  const me = useMe();
  const feeds = useQuery({ queryKey: OWN_FEEDS_KEY, queryFn: getOwnFeeds });
  const feed = feeds.data?.find((f) => f.id === feedId);
  const followers = useQuery({ queryKey: ['me', 'followers', 'all'], queryFn: getMyFollowers });
  const companions = useQuery({
    queryKey: ['trips', feed?.tripId, 'companions'],
    queryFn: () => getTripCompanions(feed?.tripId ?? ''),
    enabled: !!feed,
  });

  // 손대기 전에는 서버 값, 손대면 화면 값
  const [draft, setDraft] = useState<Set<string> | null>(null);
  const saved = feed?.visibility.hiddenViewerUserIds ?? [];
  const hidden = draft ?? new Set(saved);

  const save = useMutation({
    mutationFn: () => saveVisibility(feedId, [...hidden], feed?.visibility.version ?? 0),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['me', 'feeds'] });
      toast.show('노출 설정을 저장했어요');
      router.back();
    },
    onError: (e) => {
      if (isAxiosError(e) && e.response?.status === 409) {
        setDraft(null);
        void queryClient.invalidateQueries({ queryKey: OWN_FEEDS_KEY });
        toast.show('다른 곳에서 설정이 바뀌었어요. 다시 확인해 주세요');
        return;
      }
      toast.show('저장하지 못했어요. 다시 시도해 주세요');
    },
  });

  // 동행을 못 받으면 동행이 일반 친구로 보여 숨길 수 있게 되므로 오류로 본다(!145 리뷰)
  const failed =
    me.isError ||
    feeds.isError ||
    followers.isError ||
    companions.isError ||
    (feeds.isSuccess && !feed);
  const ready = me.data && feed && followers.data && companions.data;
  return {
    state: failed ? ('error' as const) : ready ? ('ready' as const) : ('loading' as const),
    tripTitle: feed?.title ?? null,
    rows: ready
      ? viewerRows({
          meId: me.data?.id ?? '',
          followers: followers.data ?? [],
          companions: companions.data ?? [],
          hidden,
        })
      : [],
    changed: visibilityChanged(saved, hidden),
    saving: save.isPending,
    toggle: (userId: string) => {
      const next = new Set(hidden);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      setDraft(next);
    },
    save: () => save.mutate(),
    retry: () => {
      void me.refetch();
      void feeds.refetch();
      void followers.refetch();
      void companions.refetch();
    },
  };
}
