import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { toast } from '@/components/ui';

import {
  addToTrip,
  deleteBookmark,
  getAllBookmarks,
  putBookmark,
  updateBookmarkMemo,
} from '../api';
import type { Bookmark } from '../types';

import { bookmarkKeys } from './use-bookmarks';

const samePlace = (a: Bookmark, placeId: string) => a.place?.id === placeId;

/** 메모 고치기. 응답을 바로 목록에 넣어 S14·S10이 함께 바뀐다 */
export function useUpdateMemo(placeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memo: string) => updateBookmarkMemo(placeId, memo),
    onSuccess: async (bookmark) => {
      queryClient.setQueryData<Bookmark[]>(bookmarkKeys.all, (old) =>
        old?.map((b) => (samePlace(b, placeId) ? bookmark : b)),
      );
      await queryClient.invalidateQueries({ queryKey: bookmarkKeys.all });
    },
  });
}

/** 저장 해제. 목록에서 바로 빼고, 실패하면 다시 읽는다 */
export function useDeleteBookmark(placeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteBookmark(placeId),
    onSuccess: () => {
      queryClient.setQueryData<Bookmark[]>(bookmarkKeys.all, (old) =>
        old?.filter((b) => !samePlace(b, placeId)),
      );
    },
    // 다시 받기를 기다리지 않는다. promise를 돌려주면 목록을 다 받을 때까지 화면의 onSuccess(닫기·토스트)가 미뤄진다
    onSettled: () => void queryClient.invalidateQueries({ queryKey: bookmarkKeys.all }),
  });
}

/**
 * 해제 되돌리기(토스트 [되돌리기]). S14가 닫힌 뒤 S10에서 눌리므로 화면에 묶인 mutate 콜백 대신
 * 그냥 함수로 두고 실패 토스트·[다시 시도]도 여기서 띄운다(화면이 사라지면 mutate 콜백은 불리지 않는다).
 * 서버가 PUT의 sourceFeedId를 받지 않아(400) 메모만 다시 보낸다. 공동 피드에서 담은 즐겨찾기는 되돌리면
 * 원본 피드 연결이 빠진다(백엔드 후속)
 */
export function restoreBookmark(queryClient: QueryClient, bookmark: Bookmark): void {
  const placeId = bookmark.place?.id;
  if (!placeId) return;
  putBookmark(placeId, bookmark.memo ? { memo: bookmark.memo } : {})
    .then(() => toast.show('다시 저장했어요'))
    .catch(() =>
      toast.error('되돌리지 못했어요', {
        action: { label: '다시 시도', onPress: () => restoreBookmark(queryClient, bookmark) },
      }),
    )
    .finally(() => void queryClient.invalidateQueries({ queryKey: bookmarkKeys.all }));
}

/**
 * 다른 화면의 채운 책갈피를 눌러 개인 즐겨찾기에서 빼는 함수를 준다(N7 장소 정보 창, S07 장소 줄).
 * 이미 저장한 곳을 다시 누르면 저장을 처음부터 다시 하지 않고 해제한다. 실수로 눌렀을 때를 위해 [되돌리기]를 붙인다.
 * 창이 닫힌 뒤에도 안내가 뜨도록 화면에 묶인 mutate 대신 그냥 함수로 보낸다
 */
export function useUnsavePlace(): (placeId: string) => void {
  const queryClient = useQueryClient();
  return useCallback(
    (placeId: string) => {
      const before = queryClient
        .getQueryData<Bookmark[]>(bookmarkKeys.all)
        ?.find((b) => samePlace(b, placeId));
      // 누르자마자 표시가 바뀌게 목록에서 먼저 뺀다. 실패하면 아래에서 다시 읽어 돌아온다
      queryClient.setQueryData<Bookmark[]>(bookmarkKeys.all, (old) =>
        old?.filter((b) => !samePlace(b, placeId)),
      );
      deleteBookmark(placeId)
        .then(() =>
          toast.show(
            '저장을 해제했어요',
            before
              ? {
                  action: {
                    label: '되돌리기',
                    onPress: () => restoreBookmark(queryClient, before),
                  },
                }
              : undefined,
          ),
        )
        .catch(() => toast.error('저장을 해제하지 못했어요. 다시 시도해 주세요'))
        .finally(() => void queryClient.invalidateQueries({ queryKey: bookmarkKeys.all }));
    },
    [queryClient],
  );
}

/** 그룹 즐겨찾기에 추가. 그 여행의 저장 장소 목록(S20)은 C 화면이 읽는다 */
export function useAddToTrip(placeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tripId: string) => addToTrip(tripId, placeId),
    onSuccess: (_data, tripId) =>
      queryClient.invalidateQueries({ queryKey: ['trips', tripId, 'saved-places'] }),
  });
}

/** S08 저장 위치. 나만 보기 = 개인 즐겨찾기, 동행과 같이 = 고른 여행의 그룹 즐겨찾기 */
export type SaveTarget = { kind: 'personal' } | { kind: 'trip'; tripId: string };

/**
 * S08 장소 저장. 장소 여러 곳(S12에서 찾은 장소)도 한 번에 저장한다.
 * PUT은 같은 장소면 덮어쓰고 메모를 빼면 메모가 지워져서, 이미 개인 즐겨찾기에 있는 장소는 그 메모를 다시 보낸다.
 * 원본 피드(sourceFeedId)는 서버가 아직 받지 않아(400) 보내지 않는다(백엔드 후속).
 * 그룹 즐겨찾기는 내 저장 메모를 읽을 방법이 없어 메모 없이 보낸다(이미 담은 장소면 내 메모가 지워진다, 백엔드 후속).
 * memo를 주면(S11에서 쓴 메모) 그 메모로 저장한다
 */
export function useSavePlaces() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      placeIds,
      targets,
      memo: newMemo,
    }: {
      placeIds: string[];
      /** 저장할 곳. 둘 다 고르면 개인 즐겨찾기와 여행 두 곳이 온다 */
      targets: SaveTarget[];
      memo?: string;
    }) => {
      const saveTo = async (target: SaveTarget) => {
        if (target.kind === 'trip') {
          await Promise.all(placeIds.map((placeId) => addToTrip(target.tripId, placeId, newMemo)));
          return;
        }
        const saved = await queryClient.ensureQueryData({
          queryKey: bookmarkKeys.all,
          queryFn: getAllBookmarks,
        });
        await Promise.all(
          placeIds.map((placeId) => {
            const memo = newMemo || saved.find((b) => samePlace(b, placeId))?.memo;
            return putBookmark(placeId, memo ? { memo } : {});
          }),
        );
      };
      // 두 곳 모두 같은 장소를 덮어쓰는 저장이라, 한쪽이 실패해 다시 눌러도 겹쳐 담기지 않는다
      await Promise.all(targets.map(saveTo));
    },
    onSettled: (_data, _error, { targets }) =>
      Promise.all(
        targets.map((target) =>
          queryClient.invalidateQueries({
            queryKey:
              target.kind === 'trip' ? ['trips', target.tripId, 'saved-places'] : bookmarkKeys.all,
          }),
        ),
      ),
  });
}
