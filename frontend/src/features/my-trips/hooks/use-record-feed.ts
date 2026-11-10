import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useRef } from 'react';

import { toast } from '@/components/ui';
import { deleteFeed, deleteFeedWithOwnRecords, getMyFollowers } from '@/features/feed';

import { getTripFeed, publishTripFeed } from '../api';
import type { TripFeed } from '../types';

/**
 * S38 공동 피드 키. ['me', 'feeds'] 아래에 두어 S39에서 숨김을 저장하면(그 화면이 ['me', 'feeds']를 새로 받음)
 * 돌아왔을 때 "하늘에게 숨김" 줄도 맞는다
 */
export const tripFeedKey = (tripId: string) => ['me', 'feeds', 'trip', tripId] as const;

/**
 * S38 공동 피드 상태·게시·삭제.
 * 피드를 못 읽어도 기록 화면은 보인다(게시 전으로 그림). 게시 API가 이미 게시된 피드를 돌려주므로
 * 그 상태에서 [게시]를 눌러도 피드가 둘이 되지 않는다
 */
export function useRecordFeed(tripId: string, tripTitle: string | undefined) {
  const queryClient = useQueryClient();
  const key = tripFeedKey(tripId);
  const feed = useQuery({ queryKey: key, queryFn: () => getTripFeed(tripId) });
  const hidden = feed.data?.visibility.hiddenViewerUserIds ?? [];
  // 숨긴 친구 이름은 숨긴 사람이 있을 때만 읽는다(S39와 같은 키)
  const followers = useQuery({
    queryKey: ['me', 'followers', 'all'],
    queryFn: getMyFollowers,
    enabled: hidden.length > 0,
  });
  const nameById = new Map((followers.data ?? []).map((u) => [u.id, u.nickname] as const));

  const changed = (next: TripFeed | null) => {
    queryClient.setQueryData(key, next);
    // S37 마이페이지 핀·S39·S40이 같은 게시 목록을 본다
    void queryClient.invalidateQueries({ queryKey: ['me', 'feeds'] });
  };

  // 다시 그리기 전에 두 번 누르는 것을 막는다(isPending은 다음 그리기에서야 바뀜)
  const busy = useRef(false);
  const publish = useMutation({
    mutationFn: () => publishTripFeed(tripId, tripTitle ?? ''),
  });
  const remove = useMutation({
    mutationFn: async ({ f, withRecords }: { f: TripFeed; withRecords: boolean }) => {
      if (withRecords) await deleteFeedWithOwnRecords(f.id, f.version);
      else await deleteFeed(f.id, f.version);
    },
  });

  return {
    feed: feed.data,
    nameById,
    publishing: publish.isPending,
    deleting: remove.isPending,
    publish: (onDone: () => void) => {
      if (busy.current) return;
      busy.current = true;
      publish.mutate(undefined, {
        onSuccess: (next) => {
          changed(next);
          onDone();
          toast.show('공동 피드를 게시했어요');
        },
        onError: () => toast.show('게시하지 못했어요. 다시 시도해 주세요'),
        onSettled: () => {
          busy.current = false;
        },
      });
    },
    /** withRecords: S39 "기록까지 삭제". 피드를 내리고 내 사진·방문·평가도 지운다 */
    remove: (withRecords: boolean, onDone: () => void) => {
      const current = feed.data;
      if (!current || busy.current) return;
      busy.current = true;
      remove.mutate(
        { f: current, withRecords },
        {
          onSuccess: () => {
            changed(null);
            if (withRecords) {
              // 내 기록은 접수 즉시 숨겨진다. 기록 화면의 사진·방문·평가 요약과 S41·S42를 새로 받는다
              void queryClient.invalidateQueries({ queryKey: ['trips', tripId] });
            }
            onDone();
            toast.show(withRecords ? '공동 피드와 내 기록을 삭제했어요' : '공동 피드를 삭제했어요');
          },
          onError: (e) => {
            const status = isAxiosError(e) ? e.response?.status : undefined;
            if (status === 404) {
              // 다른 동행이 먼저 지웠다. 기록까지 삭제는 지금 게시된 피드에서만 되므로 기록은 그대로다
              changed(null);
              onDone();
              toast.show(
                withRecords
                  ? '이미 삭제된 공동 피드라 기록은 지우지 않았어요'
                  : '이미 삭제된 공동 피드예요',
              );
              return;
            }
            if (status === 409) {
              void queryClient.invalidateQueries({ queryKey: key });
              toast.show('다른 곳에서 바뀌었어요. 다시 확인해 주세요');
              return;
            }
            toast.show('삭제하지 못했어요. 다시 시도해 주세요');
          },
          onSettled: () => {
            busy.current = false;
          },
        },
      );
    },
  };
}
