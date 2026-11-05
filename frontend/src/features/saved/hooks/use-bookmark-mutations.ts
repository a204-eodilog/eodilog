import { useMutation, useQueryClient } from '@tanstack/react-query';

import { addToTrip, deleteBookmark, putBookmark, updateBookmarkMemo } from '../api';
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
    onSettled: () => queryClient.invalidateQueries({ queryKey: bookmarkKeys.all }),
  });
}

/** 해제 되돌리기. 지운 즐겨찾기의 메모·원본 피드로 다시 저장한다 */
export function useRestoreBookmark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bookmark: Bookmark) =>
      putBookmark(bookmark.place?.id ?? '', {
        ...(bookmark.memo ? { memo: bookmark.memo } : {}),
        ...(bookmark.sourceFeedId ? { sourceFeedId: bookmark.sourceFeedId } : {}),
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: bookmarkKeys.all }),
  });
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
